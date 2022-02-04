from django.urls import path
from django.views.generic import TemplateView

from secretgraph.server.urls import urlpatterns as urlpatterns_server

app_name = "secretgraph_proxy"

urlpatterns = [
    path(
        "",
        TemplateView.as_view(template_name="secretgraph_proxy/home.html"),
        name="home",
    ),
    path(
        "client/",
        TemplateView.as_view(template_name="secretgraph_proxy/webclient.html"),
        name="client",
    ),
    *urlpatterns_server,
]
