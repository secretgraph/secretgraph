from django.views.generic import View
from django.views.generic.edit import UpdateView
from django.http import StreamingHttpResponse, Http404
from graphene_file_upload.django import FileUploadGraphQLView

from ..utils.encryption import iter_decrypt_contents
from ..utils.auth import initializeCachedResult
from .actions.view import fetch_contents, fetch_clusters
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


class ClustersView(AllowCORSMixin, View):

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
            info_exclude=request.GET.getlist("exclInfo")
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


class DocumentsView(AllowCORSMixin, View):

    def get(self, request, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        contents = fetch_contents(
            initializeCachedResult(
                request, authset=authset
            )["Content"]["objects"],
            kwargs.get("id"),
            info_include=request.GET.getlist("inclInfo"),
            info_exclude=request.GET.getlist("exclInfo")
        )
        if not contents:
            raise Http404()

        def gen():
            seperator = b""
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
