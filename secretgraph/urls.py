from django.conf import settings
from django.conf.urls.i18n import i18n_patterns
from django.contrib.staticfiles.storage import staticfiles_storage
from django.urls import include, path
from django.utils import timezone
from django.views.decorators.cache import cache_control
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import last_modified
from django.views.generic.base import RedirectView
from django.views.i18n import JavaScriptCatalog

from .schema import schema
from .server.views import CORSFileUploadGraphQLView

last_modified_date = timezone.now()

urlpatterns = [
    # without no contents can be retrieved
    path(
        "secretgraph/", include("secretgraph.server.urls"), name="secretgraph"
    ),
    path(
        "graphql",
        csrf_exempt(
            CORSFileUploadGraphQLView.as_view(
                graphiql=True,
                subscriptions_enabled=True,
                schema=schema,
            )
        ),
        name="graphql-plain",
    ),
    # for general favicon, see also linked favicon in template
    path(
        "favicon.ico",
        RedirectView.as_view(
            url=staticfiles_storage.url("secretgraph/favicon.svg")
        ),
    ),
]
i18n_urlpatterns = []
if not getattr(settings, "SECRETGRAPH_HEADLESS", False):
    i18n_urlpatterns.append(
        path("", include("secretgraph.proxy.urls"), name="secretgraph_proxy")
    )
    i18n_urlpatterns.append(
        path(
            "jsi18n/",
            last_modified(lambda req, **kw: last_modified_date)(
                cache_control(max_age=604800)(JavaScriptCatalog.as_view())
            ),
            name="javascript-i18n",
        )
    )
    # for localized graphql
    # TODO: remove completely as not compatible to strawberry?
    # path(
    #    "graphql",
    #    csrf_exempt(
    #        CORSFileUploadGraphQLView.as_view(
    #            graphiql=True, subscriptions_enabled=True, schema=schema
    #        )
    #    ),
    #    name="graphql-localized",
    # ),

if (
    getattr(settings, "SECRETGRAPH_ADMINAREA", False)
    and "django.contrib.admin" in settings.INSTALLED_APPS
):
    from django.contrib import admin

    i18n_urlpatterns.insert(0, path("admin/", admin.site.urls))

if "django.contrib.auth" in settings.INSTALLED_APPS:
    i18n_urlpatterns.insert(
        0, path("accounts/", include("secretgraph.user.urls"), name="auth")
    )

urlpatterns += i18n_patterns(*i18n_urlpatterns)
