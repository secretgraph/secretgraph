from django.contrib import admin
from django.urls import path, include
from django.conf import settings


urlpatterns = [
    path("accounts/", include("django.contrib.auth.urls")),
]

if (
    getattr(settings, "SECRETGRAPH_USER_ADMINAREA", False)
    and "django.contrib.admin" in settings.INSTALLED_APPS
):
    urlpatterns.append(path("admin/", admin.site.urls))
