from django.urls import path

from .views import ContentView

app_name = "secretgraph"
# app_name = "secretgraph-localized"

urlpatterns = [
    path("contents/", ContentView.as_view(), name="contents"),
    path("contents/<slug:id>/", ContentView.as_view(), name="contents"),
]
