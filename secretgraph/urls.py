from django.conf.urls.i18n import i18n_patterns
from django.contrib.staticfiles.storage import staticfiles_storage
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from django.views.generic.base import RedirectView
from django.views.i18n import JavaScriptCatalog

# from .server.views import CORSFileUploadGraphQLView

urlpatterns = [
    # without no contents can be retrieved
    # path(
    #    "secretgraph/", include("secretgraph.server.urls"), name="secretgraph"
    # ),
    # path(
    #    "graphql",
    #    csrf_exempt(CORSFileUploadGraphQLView.as_view(graphiql=True)),
    #    name="graphql-plain",
    # ),
    # for general favicon, see also linked favicon in template
    path(
        "favicon.ico",
        RedirectView.as_view(
            url=staticfiles_storage.url("secretgraph/favicon.svg")
        ),
    ),
]

urlpatterns += i18n_patterns(
    # path("", include("secretgraph.proxy.urls"), name="secretgraph_proxy"),
    path("jsi18n/", JavaScriptCatalog.as_view(), name="javascript-i18n"),
    # for localized graphql
    # path(
    #    "graphql",
    #    csrf_exempt(CORSFileUploadGraphQLView.as_view(graphiql=True)),
    #    name="graphql-localized",
    # ),
)
