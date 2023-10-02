from __future__ import annotations

import json
import logging
import os
import re
from typing import TYPE_CHECKING
from urllib.parse import quote

import ratelimit
from django.conf import settings
from django.db.models.functions import Substr
from django.http import (
    FileResponse,
    Http404,
    HttpRequest,
    HttpResponse,
    JsonResponse,
    StreamingHttpResponse,
)
from django.shortcuts import get_object_or_404
from django.utils.cache import add_never_cache_headers, patch_cache_control
from django.utils.decorators import method_decorator
from django.views.decorators.http import last_modified
from django.views.decorators.vary import vary_on_headers
from django.views.generic import View
from strawberry.django.views import AsyncGraphQLView

from ..core import constants
from .utils.auth import retrieve_allowed_objects
from .utils.encryption import iter_decrypt_contents
from .utils.mark import freeze_contents, update_file_accessed
from .view_decorators import add_cors_headers, add_secretgraph_headers, no_opener

if TYPE_CHECKING:
    from .models import Content

logger = logging.getLogger(__name__)

range_request = re.compile(r"bytes\s*=\s*(\d+)\s*-\s*(\d*)", re.I)


def calc_content_modified_raw(request, content, *args, **kwargs):
    if (
        "key_hash" in request.GET
        or request.headers.get("X-KEY-HASH", "")
        or request.META.get("HTTP_RANGE", "").strip()
    ):
        return None
    return content.updated


def calc_content_modified_decrypted(request, content, *args, **kwargs):
    if (
        not getattr(settings, "SECRETGRAPH_CACHE_DECRYPTED", False)
        and content.state not in constants.public_states
    ):
        return None
    return calc_content_modified_raw(request, content, *args, **kwargs)


def _assert_nospace(inp: set[str]):
    for el in inp:
        if " " in el:
            return False
    return True


# range support inspired from
# https://gist.github.com/dcwatson/cb5d8157a8fa5a4a046e
class RangeFileWrapper(object):
    def __init__(self, filelike, offset, length, blksize):
        self.filelike = filelike
        self.filelike.seek(offset, os.SEEK_SET)
        self.remaining = length
        self.blksize = blksize

    def close(self):
        if hasattr(self.filelike, "close"):
            self.filelike.close()

    def __iter__(self):
        return self

    def next(self):
        if self.remaining <= 0:
            raise StopIteration()
        data = self.filelike.read(min(self.remaining, self.blksize))
        if not data:
            raise StopIteration()
        self.remaining -= len(data)
        return data


def get_file_response_with_range_support(request, fileob, size, name):
    range_header = request.META.get("HTTP_RANGE", "").strip()
    range_match = range_request.match(range_header)
    if range_match:
        first_byte, last_byte = range_match.groups()
        first_byte = int(first_byte) if first_byte else 0
        last_byte = int(last_byte) if last_byte else size - 1
        # limit range
        if last_byte >= size:
            last_byte = size - 1
        length = last_byte - first_byte + 1
        response = FileResponse(
            RangeFileWrapper(
                fileob,
                offset=first_byte,
                length=length,
                blksize=FileResponse.block_size,
            ),
            status=206,
            as_attachment=False,
            filename=name,
        )
        response["Content-Length"] = str(length)
        response["Content-Range"] = "bytes %s-%s/%s" % (
            first_byte,
            last_byte,
            size,
        )
    else:
        response = FileResponse(
            fileob,
            as_attachment=False,
            filename=name,
        )
    response["Accept-Ranges"] = "bytes"
    return response


class ContentView(View):
    @method_decorator(no_opener)
    @method_decorator(add_cors_headers)
    @method_decorator(add_secretgraph_headers)
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def get(self, request: HttpRequest, *args, **kwargs):
        authset = set(
            request.headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.update(request.GET.getlist("token"))
        # authset can contain: ""
        authset.discard("")
        if settings.DEBUG:
            assert " " not in request.GET.get(
                "item", ""
            ), "whitespace in item GET parameter"
            # spaces are stripped from Authorization
            assert _assert_nospace(
                authset
            ), "whitespace in one of the tokens (GET token)"
        self.result = retrieve_allowed_objects(
            request,
            "Content",
            scope="peek"
            if "peek" in request.GET or "X-PEEK" in request.headers
            else "view",
            authset=authset,
        )
        if request.GET.get("key") or request.headers.get("X-KEY"):
            return self.handle_decrypt(
                request, authset=authset, *args, **kwargs
            )
        # raw interface
        if kwargs.get("id"):
            content = get_object_or_404(
                self.result["objects_with_public"], downloadId=kwargs["id"]
            )
        else:
            content = get_object_or_404(self.result["objects_without_public"])
        if "X-KEY-HASH" in request.headers or "key_hash" in request.GET:
            return self.handle_content_key_hashes(
                request, content, *args, **kwargs
            )
        else:
            return self.handle_raw_singlecontent(
                request, content, *args, **kwargs
            )

    def handle_decrypt(self, request: HttpRequest, id, *args, **kwargs):
        content = get_object_or_404(
            self.result["objects_with_public"], downloadId=id
        )
        try:
            response = self.handle_decrypt_inner(
                request, content, *args, **kwargs
            )
        except ratelimit.DISABLED:
            return HttpResponse(
                reason="Disabled functionality", status_code=503
            )

        if (
            not getattr(settings, "SECRETGRAPH_CACHE_DECRYPTED", False)
            and content
        ):
            add_never_cache_headers(response)
        return response

    @method_decorator(last_modified(calc_content_modified_decrypted))
    def handle_decrypt_inner(
        self, request: HttpRequest, content, *args, **kwargs
    ):
        serverside_decryption_rate = settings.SECRETGRAPH_RATELIMITS.get(
            "DECRYPT_SERVERSIDE"
        )
        if serverside_decryption_rate:
            r = ratelimit.get_ratelimit(
                group="serverside_decryption",
                key="ip",
                request=request,
                rate=serverside_decryption_rate,
                action=ratelimit.Action.INCREASE,
            )
            if r.request_limit >= 1:
                raise ratelimit.RatelimitExceeded(
                    "Ratelimit for server side decryptions exceeded"
                )

        # shallow copy initialization of result
        result = self.result.copy()
        result["objects_with_public"] = result["objects_with_public"].filter(
            id=content.id
        )

        decryptset = set(
            request.headers.get("X-KEY", "").replace(" ", "").split(",")
        )
        decryptset.update(self.request.GET.getlist("key"))
        decryptset.discard("")
        if settings.DEBUG:
            # spaces are stripped from X-KEY
            assert _assert_nospace(
                decryptset
            ), "whitespace in one of the keys (GET key)"
        try:
            iterator = iter_decrypt_contents(result, decryptset=decryptset)
            content = next(iterator)
        except StopIteration:
            if decryptset:
                return HttpResponse("No matching key", status=400)
            return HttpResponse("Missing key", status=400)
        if result["scope"] != "peek":
            freeze_contents([content.id], request)
        names = content.tags_proxy.name
        if hasattr(content, "read_decrypt"):
            response = StreamingHttpResponse(content.read_decrypt())
            if isinstance(names[0], str):
                # do it according to django
                try:
                    # check if ascii
                    names[0].encode("ascii")
                    header = 'attachment; filename="{}"'.format(
                        names[0].replace("\\", "\\\\").replace('"', r"\"")
                    )
                except UnicodeEncodeError:
                    header = "attachment; filename*=utf-8''{}".format(
                        quote(names[0])
                    )
                response["Content-Disposition"] = header
            response["X-Robots-Tag"] = "noindex,nofollow"
        else:
            response = get_file_response_with_range_support(
                request, content.file.read("rb"), content.file.size, names[0]
            )
            if content.cluster.featured:
                response["X-Robots-Tag"] = "index,follow"
            else:
                response["X-Robots-Tag"] = "index,nofollow"

        update_file_accessed([content.id])
        response["X-TYPE"] = content.type
        return response

    def handle_content_key_hashes(
        self, request, content: Content, *args, **kwargs
    ):
        # this is the only way without content id (and only download id) to verify
        # here we can extract private keys when allowed to do so

        signature_and_key_retrieval_rate = settings.SECRETGRAPH_RATELIMITS.get(
            "SIGNATURE_AND_KEY_RETRIEVAL"
        )
        if signature_and_key_retrieval_rate:
            r = ratelimit.get_ratelimit(
                group="signature_and_key_retrieval",
                key="ip",
                request=request,
                rate=signature_and_key_retrieval_rate,
                action=ratelimit.Action.INCREASE,
            )
            if r.request_limit >= 1:
                raise ratelimit.RatelimitExceeded(
                    "Ratelimit for signature and key retrieval exceeded"
                )
        keyhash_set = set(
            request.headers.get("X-KEY-HASH", "").replace(" ", "").split(",")
        )
        keyhash_set.update(request.GET.getlist("key_hash"))
        keyhash_set.discard("")
        response = JsonResponse(
            {
                "signatures": {
                    i.pop("hash"): i
                    for i in content.signatures(
                        keyhash_set, allowed=self.result["objects_with_public"]
                    )
                },
                "keys": {
                    i.pop("hash"): i
                    for i in content.keys(
                        keyhash_set, allowed=self.result["objects_with_public"]
                    )
                },
            },
        )

        response["X-TYPE"] = content.type
        response["X-Robots-Tag"] = "noindex,nofollow"
        return response

    @method_decorator(vary_on_headers("RANGE", "Authorization"))
    @method_decorator(last_modified(calc_content_modified_raw))
    def handle_raw_singlecontent(
        self, request, content: Content, *args, **kwargs
    ):
        try:
            name = content.tags.filter(tag__startswith="name=").first()
            if name:
                name = name.tag.split("=", 1)[-1]
            response = get_file_response_with_range_support(
                request, content.file.open("rb"), content.file.size, name
            )
            update_file_accessed([content.id])
        except FileNotFoundError as e:
            raise Http404() from e
        if self.result["scope"] != "peek":
            freeze_contents([content.id], self.request)
        response["X-TYPE"] = content.type
        verifiers = content.references.filter(group="signature")
        response["X-IS-SIGNED"] = json.dumps(verifiers.exists())
        response["X-NONCE"] = content.nonce
        response["X-Robots-Tag"] = "noindex,nofollow"
        if content.type == "PrivateKey":
            response["X-KEY"] = ",".join(
                content.tags.filter(tag__startswith="key=")
                .annotate(raw_key=Substr("tag", 5))
                .values_list("raw_key", flat=True)
            )
        # otherwise crazy stuff happens after updates
        # checks for public key and immutable flag
        if content.is_mutable:
            patch_cache_control(response, max_age=0)
        return response


class CORSFileUploadGraphQLView(AsyncGraphQLView):
    @method_decorator(add_secretgraph_headers)
    async def stub_response(self, request, *args, **kwargs):
        return HttpResponse("stub for cluster")

    @method_decorator(add_cors_headers)
    async def dispatch(self, request, *args, **kwargs):
        # if settings.DEBUG and "operations" in request.POST:
        #     operations = json.loads(request.POST.get("operations", "{}"))
        #     logger.debug(
        #            "operations:\n%s\nmap:\n%s\nFILES:\n%s",
        #            pprint.pformat(operations),
        #            pprint.pformat(json.loads(request.POST.get("map", "{}"))),
        #            pprint.pformat(request.FILES),
        #     )
        if (
            request.method.lower() == "get"
            and request.GET
            and "query" not in request.GET
        ):
            return await self.stub_response(request, *args, **kwargs)
        return await super().dispatch(request, *args, **kwargs)
