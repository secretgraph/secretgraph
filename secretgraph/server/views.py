from django.views.generic import View
from django.views.generic.edit import UpdateView
from django.http import StreamingHttpResponse, Http404

from .utils.encryption import iter_decrypt_contents
from .actions.view import fetch_contents, fetch_clusters
from .forms import PushForm, UpdateForm


class ClustersView(View):

    def get(self, request, *args, **kwargs):
        # for authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        result = fetch_clusters(
            request, query=kwargs.get("id"), authset=authset,
            info_include=request.GET.getlist("incl_info"),
            info_exclude=request.GET.getlist("excl_info")
        )
        if not result["objects"]:
            raise Http404()

        def gen():
            seperator = b""
            for cluster in result["objects"]:
                yield seperator
                # public_info cannot contain \0 because of TextField
                yield cluster.public_info
                seperator = b"\0"

        return StreamingHttpResponse(gen())


class DocumentsView(View):

    def get(self, request, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        result = fetch_contents(
            request, query=kwargs.get("id"), authset=authset,
            info_include=request.GET.getlist("incl_info"),
            info_exclude=request.GET.getlist("excl_info")
        )
        if not result["objects"]:
            raise Http404()

        def gen():
            seperator = b""
            for document in iter_decrypt_contents(
                result["objects"], authset
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


class PushView(UpdateView):
    form_class = PushForm

    def post(self, request, id, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))


class UpdateView(UpdateView):
    form_class = UpdateForm

    def post(self, request, id, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
