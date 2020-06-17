from django.urls import path
from .views import ClustersView, DocumentsView

app_name = "secretgraph"

urlpatterns = [
    path(
        "clusters/",
        ClustersView.as_view(),
        name="clusters"
    ),
    path(
        "clusters/<slug:id>/",
        ClustersView.as_view(),
        name="clusters"
    ),
    path(
        "contents/",
        DocumentsView.as_view(),
        name="documents"
    ),
    path(
        "contents/<slug:id>/",
        DocumentsView.as_view(),
        name="documents"
    ),
]
