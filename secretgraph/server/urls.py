from django.urls import path
from .views import ContentView, ClusterGroupKeyView

app_name = "secretgraph"
# app_name = "secretgraph-localized"

urlpatterns = [
    path(
        "group_key/", ClusterGroupKeyView.as_view(), name="cluster_group_key"
    ),
    path("contents/", ContentView.as_view(), name="contents"),
    path("contents/<slug:id>/", ContentView.as_view(), name="contents"),
    path(
        "contents/<slug:id>/push/",
        ContentView.as_view(action="push"),
        name="contents-push",
    ),
    path(
        "contents/<slug:id>/update/",
        ContentView.as_view(action="update"),
        name="contents-update",
    ),
]
