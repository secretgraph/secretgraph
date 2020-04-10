from django.views.generic import View


class DownloadView(View):
    model = None

    def get(self, request, *args, **kwargs):
        # TODO: still required? Isn't it enough to change file location and
        # offload directly to web server
        # check permission, redirect or directly offer, add nonce as header
        pass


class PlainView(View):
    model = None

    def get(self, request, *args, **kwargs):
        # check permission, redirect or directly offer, add nonce as header
        pass
