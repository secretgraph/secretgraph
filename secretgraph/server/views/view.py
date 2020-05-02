from django.views.generic import View
from django.http import StreamingHttpResponse

from ..utils.misc import IterJsonEncoder
from ..actions.view import fetch_contents, fetch_contents_decrypted


encoder = IterJsonEncoder()

class DocumentsView(View):
    model = None
    try_decrypt = True

    def get(self, request, *args, **kwargs):
        if self.try_decrypt:
            contents = fetch_contents_decrypted()
        else:
            contents = fetch_contents()

        # single
        if kwargs.get("id"):
            try:
                contents = next(contents)
            except StopIteration:
                raise Http404()
            response = StreamingHttpResponse(
                contents
            )
        else:
            response = StreamingHttpResponse(
                encoder.iterencode(contents)
            )

        # check permission, redirect or directly offer, add nonces as header
        return response
