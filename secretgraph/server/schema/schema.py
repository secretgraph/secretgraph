# from django.conf import settings
from datetime import timedelta as td

import graphene
from django.db import models
from django.utils import timezone
from graphene import relay

from ..models import Action, Component, Content, ContentAction
from ..utils.auth import retrieve_allowed_objects
from .definitions import (
    ComponentConnection, ComponentNode, ContentConnection, ContentNode,
    ServerConfig
)
from .mutations import (
    ComponentMutation, ContentMutation, PushContentMutation,
    RegenerateFlexidMutation
)


class Query():
    server_config = graphene.Field(ServerConfig)
    component = relay.Node.Field(ComponentNode)
    components = relay.ConnectionField(ComponentConnection)
    all_components = relay.ConnectionField(ComponentConnection)

    content = relay.Node.Field(ContentNode)
    contents = relay.ConnectionField(ContentConnection)

    def resolve_all_components(self, info, user):
        components = Component.objects.all()
        if user:
            components = components.filter(user__username=user)
        if not info.context.user.is_staff:
            components = components.filter(public=True)
        return components

    def resolve_components(self, info, **kwargs):
        result = retrieve_allowed_objects(
            info, "view", Component.objects.all()
        )
        return result["objects"]

    def resolve_content(self, info, content_id):
        result = retrieve_allowed_objects(
            info, "view", Content.objects.all()
        )
        _content = result["objects"].get(id=content_id)
        actions = \
            result["components"][_content.component.flexid]["actions"].filter(
                content_action__content=_content
            ).prefetch_selected("content_action")
        use_fetch = False
        for action in actions:
            if "fetch" in action.extras:
                use_fetch = True
                break
        _content.actions.filter(action__in=actions).update(used=True)
        if use_fetch and _content.actions.filter(
            group="fetch", used=False
        ):
            _content.mark_for_destruction = timezone.now() + td(hours=8)
            _content.save(update_fields=["mark_for_destruction"])
        return _content

    def resolve_contents(self, info, include_info, exclude_info):
        include = models.Q()
        for i in include_info:
            include |= models.Q(info__tag__startswith=i)
        exclude = models.Q()
        for i in exclude_info:
            exclude |= models.Q(info__tag__startswith=i)
        result = retrieve_allowed_objects(
            info, "view", Content.objects.filter(include & ~exclude)
        )

        actions = {i["actions"].ids() for i in result["components"].values()}
        actions = Action.objects.filter(
            id__in=actions,
            content_action__content__in=result["objects"]
        ).prefetch_selected("content_action")
        ContentAction.objects.filter(
            action__in=actions, content__in=result["objects"]
        ).update(used=True)
        return result["objects"]


class Mutation():
    update_content = ContentMutation.Field()
    update_component = ComponentMutation.Field()
    push_content = PushContentMutation.Field()
    regenerate_flexid = RegenerateFlexidMutation.Field()
