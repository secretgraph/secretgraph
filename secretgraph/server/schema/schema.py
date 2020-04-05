# from django.conf import settings
from graphene import relay
from graphene_django.filter import DjangoFilterConnectionField

from ..models import Component, Content
from ..utils import retrieve_allowed_objects
from .mutations import (
    ComponentMutation, ContentMutation, PushContentMutation,
    RegenerateFlexidMutation
)
from .definitions import ComponentNode, ContentNode


class Query():
    component = relay.Node.Field(ComponentNode)
    components = DjangoFilterConnectionField(ComponentNode)
    all_components = DjangoFilterConnectionField(ComponentNode)

    content = relay.Node.Field(ContentNode)
    contents = DjangoFilterConnectionField(ContentNode)

    def resolve_all_components(self, info, **kwargs):
        if info.context.user.is_staff:
            return Component.objects.all()
        return Component.objects.filter(public=True)

    def resolve_components(self, info, **kwargs):
        return retrieve_allowed_objects(
            info, "view", Component.objects.all()
        )

    def resolve_content(self, info, content_id):
        result = retrieve_allowed_objects(
            info, "view", Content.objects.all()
        )
        _content = result["objects"].get(id=content_id)
        return _content

    def resolve_contents(self, info, **kwargs):
        return retrieve_allowed_objects(
            info, "view", Content.objects.all(), level=5
        )


class Mutation():
    update_content = ContentMutation.Field()
    update_component = ComponentMutation.Field()
    push_content = PushContentMutation.Field()
    regenerate_flexid = RegenerateFlexidMutation.Field()
