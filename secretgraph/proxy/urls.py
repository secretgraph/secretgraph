from django.urls import path
from django.views.generic import TemplateView
from django.views.decorators.cache import cache_control

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
        "pcluster/<slug:id>/",
        TemplateView.as_view(
            template_name="secretgraph_proxy/cluster.html",
        ),
        name="cluster",
    ),
    path(
        "pcontent/<slug:id>/",
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
]
