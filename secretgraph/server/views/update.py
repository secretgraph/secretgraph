from django.views.generic import View


class UpdateView(View):
    model = None

    def post(self, request, *args, **kwargs):
        pass


class PushView(View):
    model = None

    def post(self, request, *args, **kwargs):
        pass
