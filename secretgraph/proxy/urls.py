from django.urls import path
from django.views.decorators.cache import cache_control
from django.views.generic import TemplateView

from secretgraph.server.view_decorators import no_opener

from .views import WebmanifestView

app_name = "secretgraph_proxy"


urlpatterns = [
    path(
        "",
        no_opener(
            TemplateView.as_view(
                template_name="secretgraph_proxy/home.html",
            )
        ),
        name="home",
    ),
    path(
        "pcluster/<slug:id>/",
        no_opener(
            TemplateView.as_view(
                template_name="secretgraph_proxy/cluster.html",
            )
        ),
        name="cluster",
    ),
    path(
        "pcontent/<slug:id>/",
        no_opener(
            TemplateView.as_view(
                template_name="secretgraph_proxy/content.html",
            )
        ),
        name="content",
    ),
    path(
        "client/",
        cache_control(max_age=604800)(
            TemplateView.as_view(
                template_name="secretgraph_proxy/webclient.html"
            )
        ),
        name="client",
    ),
    path(
        "webmanifest.json",
        cache_control(max_age=604800)(WebmanifestView.as_view()),
        name="webmanifest.json",
    ),
]
