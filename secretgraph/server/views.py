import json

from django.conf import settings
from django.http import (
    FileResponse, Http404, JsonResponse, StreamingHttpResponse
)
from django.views.generic import View
from django.views.generic.edit import UpdateView
from graphene_file_upload.django import FileUploadGraphQLView

from ..utils.auth import fetch_by_id, initializeCachedResult
from ..utils.encryption import iter_decrypt_contents
from .actions.view import fetch_clusters, fetch_contents
from .forms import PushForm, UpdateForm


class AllowCORSMixin(object):

    def add_cors_headers(self, response):
        response["Access-Control-Allow-Origin"] = "*"
        if self.request.method == "OPTIONS":
            # copy from allow
            response["Access-Control-Allow-Methods"] = response['Allow']

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        self.add_cors_headers(response)
        return response


class ClustersView(View):

    def get(self, request, *args, **kwargs):
        # for authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        clusters = fetch_clusters(
            initializeCachedResult(
                request, authset=authset
            )["Cluster"]["objects"],
            kwargs.get("id"),
            info_include=request.GET.getlist("inclInfo"),
            info_exclude=request.GET.getlist("exclInfo"),
            content_hashes=request.GET.getlist("contentHash")
        )
        if not clusters:
            raise Http404()

        def gen():
            seperator = b""
            for cluster in clusters["objects"]:
                yield seperator
                # publicInfo cannot contain \0 because of TextField
                yield cluster.publicInfo
                seperator = b"\0"

        return StreamingHttpResponse(gen())


class DocumentsView(View):

    def get(self, request, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        result = initializeCachedResult(
            request, authset=authset
        )["Content"]
        contents = fetch_contents(
            result["objects"],
            result["actions"],
            kwargs.get("id"),
            info_include=request.GET.getlist("inclInfo"),
            info_exclude=request.GET.getlist("exclInfo"),
            content_hashes=request.GET.getlist("contentHash")
        )
        if not contents:
            raise Http404()

        def gen():
            seperator = b""
            # currently it would add unverified results for the second call
            # and the client here has here no way to check them anyway
            for document in iter_decrypt_contents(
                contents, authset
            ):
                yield seperator
                if kwargs.get("id"):
                    # don't alter document
                    for chunk in document:
                        yield chunk
                else:
                    # seperate with \0
                    for chunk in document:
                        yield chunk.replace(b"\0", b"\\0")
                seperator = b"\0"

        return StreamingHttpResponse(gen())


class RawView(View):
    def get(self, request, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        result = initializeCachedResult(
            request, authset=authset
        )["Content"]
        content = None
        try:
            content = fetch_by_id(
                result["objects"], kwargs["id"]
            ).first()
        finally:
            if not content:
                raise Http404()
        if "signatures" in request.GET:
            refs = content.references.select_related("target").filter(
                group="verify"
            )
            response = JsonResponse({
                "signatures": {
                    ref.target.contentHash: {
                        "signature": ref.extra,
                        "link": ref.target.link
                    }
                    for ref in refs
                }
            })
            response["X-IS-VERIFIED"] = "false"
        else:
            response = FileResponse(content.value.open("rb"))
            _type = content.info.filter(tag__startswith="type=").first()
            response["X-TYPE"] = _type.split("=", 1)[1] if _type else ""
            verifiers = content.references.filter(
                group="verify"
            )
            response["X-IS-VERIFIED"] = json.dumps(verifiers.exists())
        response["X-NONCE"] = content.nonce
        response["X-ITERATIONS"] = ",".join(
            settings.SECRETGRAPH_ITERATIONS
        )
        response["X-HASH-ALGORITHMS"] = ",".join(
            settings.SECRETGRAPH_HASH_ALGORITHMS
        )
        return response


class PushView(AllowCORSMixin, UpdateView):
    form_class = PushForm

    def post(self, request, id, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))


class UpdateView(AllowCORSMixin, UpdateView):
    form_class = UpdateForm

    def post(self, request, id, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))


class CORSFileUploadGraphQLView(AllowCORSMixin, FileUploadGraphQLView):
    pass
