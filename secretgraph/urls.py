from django.conf.urls.i18n import i18n_patterns
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from django.views.i18n import JavaScriptCatalog
from graphene_file_upload.django import FileUploadGraphQLView

from .proxy.views import ProxyView

urlpatterns = [
    path(
        "graphql",
        csrf_exempt(FileUploadGraphQLView.as_view(graphiql=True)),
        name="graphql-plain"
    ),
    path("secretgraph/", include("secretgraph.server.urls")),

]

urlpatterns += i18n_patterns(
    path(
        "",
        ProxyView.as_view()
    ),
    path('jsi18n/', JavaScriptCatalog.as_view(), name='javascript-i18n'),
    # for localized graphql
    path(
        "graphql",
        csrf_exempt(FileUploadGraphQLView.as_view(graphiql=True)),
        name="graphql-localized"
    )
)
