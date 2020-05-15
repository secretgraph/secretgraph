from django.conf import settings
from django.views.generic import TemplateView


class ProxyView(TemplateView):
    template_name = "secretgraph_proxy/index.html"
    extra_context = {
        "server_path": getattr(settings, "SECRETGRAPH_SERVER_PATH", "/graphql")
    }
