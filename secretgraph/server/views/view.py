import json

from django.views.generic import View
from django.http import StreamingHttpResponse, Http404

from ..utils.misc import FakeList
from ..utils.encryption import iter_decrypt_contents
from ..actions.view import fetch_contents


encoder = json.JsonEncoder()


class DocumentsView(View):
    model = None
    decrypt = False

    def get(self, request, *args, **kwargs):
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        result = fetch_contents(
            request, query=kwargs.get("id"), authset=authset
        )
        if self.decrypt:
            def gen():
                seperator = b""
                for document in iter_decrypt_contents(
                    result["objects"], authset
                ):
                    yield seperator
                    for chunk in document:
                        yield chunk.replace(b"\0", b"\\0")
                    seperator = b"\0"
        else:
            def gen():
                seperator = b""
                for content in result["objects"]:
                    yield seperator
                    if kwargs.get("id"):
                        yield b"nonce\0"
                        yield b"keys\0"
                    with content.value.open("rb") as fileob:
                        chunk = fileob.read(512)
                        while chunk:
                            yield chunk.replace(b"\0", b"\\0")
                            chunk = fileob.read(512)
                    seperator = b"\0"

        response = StreamingHttpResponse(
            encoder.iterencode(gen())
        )

        # check permission, redirect or directly offer, add nonces as header
        return response
