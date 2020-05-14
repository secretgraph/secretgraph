from django.conf.urls.i18n import i18n_patterns
from django.urls import include, path
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import TemplateView


# from graphene_django.views import GraphQLView
from graphene_file_upload.django import FileUploadGraphQLView

urlpatterns = [
    path("graphql", csrf_exempt(FileUploadGraphQLView.as_view(graphiql=True))),
    path("secretgraph/", include("secretgraph.server.urls")),

]

urlpatterns += i18n_patterns(
    path(
        "",
        TemplateView.as_view(template_name="secretgraph/index.html")
    )
)
