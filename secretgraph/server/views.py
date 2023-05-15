import json
import logging
from urllib.parse import quote

import ratelimit
from django.conf import settings
from django.db.models import OuterRef, Q, Subquery
from django.db.models.functions import Substr
from django.http import (
    FileResponse,
    Http404,
    HttpResponse,
    JsonResponse,
    StreamingHttpResponse,
    HttpRequest,
)
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.cache import add_never_cache_headers
from django.utils.decorators import method_decorator
from django.utils.cache import patch_cache_control
from django.views.decorators.http import last_modified

from django.views.generic import View
from strawberry.django.views import AsyncGraphQLView

from ..core import constants
from .utils.auth import retrieve_allowed_objects
from .utils.encryption import iter_decrypt_contents
from .utils.mark import freeze_contents, update_file_accessed
from .view_decorators import (
    add_cors_headers,
    add_secretgraph_headers,
    no_opener,
)

logger = logging.getLogger(__name__)


def calc_content_modified_raw(request, content, *args, **kwargs):
    if "key_hash" in request.GET or request.headers.get("X-KEY-HASH", ""):
        return None
    return content.updated


def calc_content_modified_decrypted(request, content, *args, **kwargs):
    if (
        not getattr(settings, "SECRETGRAPH_CACHE_DECRYPTED", False)
        and content.state not in constants.public_states
    ):
        return None
    return calc_content_modified_raw(request, content, *args, **kwargs)


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
                self.result["objects"], downloadId=kwargs["id"]
            )
        else:
            content = get_object_or_404(self.result["objects_ignore_public"])
        response = self.handle_raw_singlecontent(
            request, content, *args, **kwargs
        )
        return response

    def handle_decrypt(self, request: HttpRequest, id, *args, **kwargs):
        content = get_object_or_404(self.result["objects"], downloadId=id)
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
        result["objects"] = result["objects"].filter(id=content.id)

        decryptset = set(
            request.headers.get("X-Key", "").replace(" ", "").split(",")
        )
        decryptset.update(self.request.GET.getlist("key"))
        decryptset.discard("")
        try:
            iterator = iter_decrypt_contents(result, decryptset=decryptset)
            content = next(iterator)
        except StopIteration:
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
            response = FileResponse(content.file.read("rb"))
            if content.cluster.featured:
                response["X-Robots-Tag"] = "index,follow"
            else:
                response["X-Robots-Tag"] = "index,nofollow"

        update_file_accessed([content.id])
        response["X-TYPE"] = content.type
        return response

    @method_decorator(last_modified(calc_content_modified_raw))
    def handle_raw_singlecontent(self, request, content, *args, **kwargs):
        if "key_hash" in request.GET or request.headers.get("X-KEY-HASH", ""):
            keyhash_set = set(
                request.headers.get("X-KEY-HASH", "")
                .replace(" ", "")
                .split(",")
            )
            keyhash_set.update(request.GET.getlist("key_hash"))
            refs = content.references.select_related("target").filter(
                group__in=["key", "signature"]
            )
            # Public key in result set
            q = Q(target__in=self.result["objects"])
            for k in keyhash_set:
                q |= Q(target__tags__tag=f"key_hash={k}")
            # signatures first, should be maximal 20, so on first page
            refs = (
                refs.filter(q)
                .annotate(
                    privkey_downloadId=Subquery(
                        # private keys in result set, empty if no permission
                        self.result["objects"]
                        .filter(
                            type="PrivateKey",
                            references__target__referencedBy=OuterRef("pk"),
                        )
                        .values("downloadId")[:1]
                    )
                )
                .order_by("-group", "id")
            )
            response = {
                "signatures": {},
                "keys": {},
            }
            for ref in refs:
                if ref.group == "key":
                    response["keys"][
                        ref.target.contentHash.removeprefix("Key:")
                    ] = {
                        "key": ref.extra,
                        "link": (
                            ref.privkey_downloadId
                            and reverse(
                                "secretgraph:contents",
                                kwargs={"id": ref.privkey_downloadId},
                            )
                        )
                        or "",
                    }
                else:
                    response["signatures"][
                        ref.target.contentHash.removeprefix("Key:")
                    ] = {
                        "signature": ref.extra,
                        "link": ref.target.link,
                    }
            response = JsonResponse(response)
        else:
            try:
                name = content.tags.filter(tag__startswith="name=").first()
                if name:
                    name = name.tag.split("=", 1)[-1]
                response = FileResponse(
                    content.file.open("rb"),
                    as_attachment=bool(name),
                    filename=name,
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
