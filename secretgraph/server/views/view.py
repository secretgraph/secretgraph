from django.views.generic import View
from django.http import StreamingHttpResponse, Http404

from ..utils.encryption import iter_decrypt_contents
from ..actions.view import fetch_contents


class DocumentsView(View):
    model = None

    def get(self, request, *args, **kwargs):
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        result = fetch_contents(
            request, query=kwargs.get("id"), authset=authset
        )

        def gen():
            seperator = b""
            for document in iter_decrypt_contents(
                result["objects"], authset
            ):
                yield seperator
                for chunk in document:
                    yield chunk.replace(b"\0", b"\\0")
                seperator = b"\0"
        if not result["objects"]:
            raise Http404()

        return StreamingHttpResponse(gen())
