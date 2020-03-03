
from django.conf import settings
from graphene import relay
from graphene_django import DjangoObjectType
from graphene_django.filter import DjangoFilterConnectionField

from .models import Component, Content, ContentValue, ReferenceContent
from .utils import retrieve_allowed_objects


class ReferenceContentConnection(relay.Connection, DjangoObjectType):
    class Meta:
        model = ReferenceContent
        fields = ['source', 'target', 'name', 'delete_recursive']
        node = relay.Node


class ContentNode(DjangoObjectType):
    class Meta:
        model = Content
        filter_fields = {
            'component': ['exact'],
            'values__name': ['exact', 'startswith'],
            'values__value': ['exact', 'startswith'],
            'references__name': ['exact', 'startswith']
        }
        interfaces = (relay.Node,)
        fields = [
            'nonce', 'component', 'values', 'references', 'referenced_by'
        ]
    references = relay.ConnectionField(ReferenceContentConnection)


class ComponentNode(DjangoObjectType):
    class Meta:
        model = Component
        interfaces = (relay.Node,)
        fields = ['public_info']
        if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
            fields.append("user")

    def resolve_id(self, info):
        return self.flexid

    @classmethod
    def get_node(cls, info, id):
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            return queryset.get(flexid=id)
        except cls._meta.model.DoesNotExist:
            return None


class ContentValueNode(DjangoObjectType):
    class Meta:
        model = ContentValue
        interfaces = (relay.Node,)
        fields = ['content', 'updated', 'value', 'file']


"""

class UploadFile(graphene.ClientIDMutation):
    class Input:
        pass
        # nothing needed for uploading file

    # your return fields
    success = graphene.String()

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        # When using it in Django, context will be the request
        files = info.context.FILES
        # Or, if used in Flask, context will be the flask global request
        # files = context.files

        # do something with files

        return UploadFile(success=True)
"""


class Query():
    component = relay.Node.Field(ComponentNode)
    all_components = DjangoFilterConnectionField(ComponentNode)

    content = relay.Node.Field(ContentNode)
    all_contents = DjangoFilterConnectionField(ContentNode)

    def resolve_all_components(self, info, **kwargs):
        if info.context.user.is_staff:
            return Component.objects.all()
        return Component.objects.none()

    def resolve_content(self, info, content_id):
        return retrieve_allowed_objects(
            info, "view", Content.objects.all()
        ).get(id=content_id)

    def resolve_all_contents(self, info, **kwargs):
        return retrieve_allowed_objects(
            info, "view", Content.objects.all()
        )


class Mutation():
    pass
