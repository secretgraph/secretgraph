

from django.views import View


class DownloadView(View):
    model = None

    def get(self, request, *args, **kwargs):
        # check permission, redirect or directly offer, add nonce as header
        pass
