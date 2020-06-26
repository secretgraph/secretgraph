from django.conf import settings
from django.shortcuts import resolve_url
from django.views.generic import TemplateView


class ProxyView(TemplateView):
    template_name = "secretgraph_proxy/index.html"

    def get_context_data(self, **kwargs):
        kwargs["graphql_path"] = resolve_url(getattr(
            settings, "SECRETGRAPH_GRAPHQL_PATH", "/graphql"
        ))
        return super().get_context_data(**kwargs)
