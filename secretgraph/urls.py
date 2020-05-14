from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt

# from graphene_django.views import GraphQLView
from graphene_file_upload.django import FileUploadGraphQLView
from django.views.generic import TemplateView


urlpatterns = [
    path("graphql", csrf_exempt(FileUploadGraphQLView.as_view(graphiql=True))),
    path("secretgraph/", include("secretgraph.server.urls")),
    path(
        "",
        TemplateView.as_view(template_name="secretgraph/index.html")
    )
]
