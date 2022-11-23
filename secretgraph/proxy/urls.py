from django.urls import path
from django.views.generic import TemplateView
from django.views.decorators.cache import cache_control

from secretgraph.server.urls import urlpatterns as urlpatterns_server

app_name = "secretgraph_proxy"


urlpatterns = [
    path(
        "",
        TemplateView.as_view(
            template_name="secretgraph_proxy/home.html",
        ),
        name="home",
    ),
    path(
        "cluster/<slug:id>/",
        TemplateView.as_view(
            template_name="secretgraph_proxy/cluster.html",
        ),
        name="cluster",
    ),
    path(
        "content/<slug:id>/",
        TemplateView.as_view(
            template_name="secretgraph_proxy/content.html",
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
    *urlpatterns_server,
]
