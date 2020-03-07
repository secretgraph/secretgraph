# from django.conf import settings
from graphene import relay
from graphene_django.filter import DjangoFilterConnectionField

from ..models import Component, Content
from ..utils import retrieve_allowed_objects
from .mutations import (
    ComponentMutation, ContentMutation, PushContentMutation,
    RegenerateFlexidMutation
)
from .nodes import ComponentNode, ContentNode


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
        result = retrieve_allowed_objects(
            info, "view", Content.objects.all()
        )
        _content = result["objects"].get(id=content_id)
        _content.values = _content.values.exclude(result["excl_values"])
        return _content

    def resolve_all_contents(self, info, **kwargs):
        result = retrieve_allowed_objects(
            info, "view", Content.objects.all()
        )

        def _helper(_content):
            _content.values = _content.values.exclude(result["excl_values"])
        return map(_helper, result["objects"])


class Mutation():
    update_content = ContentMutation.Field()
    update_component = ComponentMutation.Field()
    push_content = PushContentMutation.Field()
    regenerate_flexid = RegenerateFlexidMutation.Field()
