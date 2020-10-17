from django.urls import path
from .views import ContentView, ClusterView

app_name = "secretgraph"

urlpatterns = [
    path(
        "clusters/<slug:id>/",
        ClusterView.as_view(),
        name="clusters"
    ),
    path(
        "contents/",
        ContentView.as_view(),
        name="contents"
    ),
    path(
        "contents/<slug:id>/",
        ContentView.as_view(),
        name="contents"
    ),
    path(
        "contents/<slug:id>/push/",
        ContentView.as_view(action="push"),
        name="contents-push"
    ),
    path(
        "contents/<slug:id>/update/",
        ContentView.as_view(action="update"),
        name="contents-update"
    ),
]
