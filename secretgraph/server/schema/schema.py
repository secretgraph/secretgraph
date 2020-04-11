
import graphene
from graphene import relay
from django.db.models import Q

from ..models import Component
from ..actions.view import fetch_contents, fetch_components
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

    def resolve_component(
        self, info, id, **kwargs
    ):
        res = fetch_components(
            info.context, query=id
        )

        if not res:
            raise res.model.DoesNotExist(
                "%s matching query does not exist." %
                res.model._meta.object_name
            )
        return res.first()

    def resolve_all_components(
        self, info, user=None, **kwargs
    ):
        incl_filters = Q()
        for i in kwargs.get("info_include") or []:
            incl_filters |= Q(info__tag__startswith=i)

        excl_filters = Q()
        for i in kwargs.get("info_exclude") or []:
            excl_filters |= Q(info__tag__startswith=i)
        components = Component.objects.filter(
            ~excl_filters & incl_filters
        )
        if user:
            components = components.filter(user__username=user)
        if not info.context.user.is_staff:
            components = components.filter(public=True)
        return components

    def resolve_components(
        self, info, **kwargs
    ):
        return fetch_components(
            info.context,
            info_include=kwargs.get("info_include"),
            info_exclude=kwargs.get("info_exclude")
        )

    def resolve_content(self, info, id, **kwargs):
        res = fetch_contents(
            info.context, query=id
        )
        if not res:
            raise res.model.DoesNotExist(
                "%s matching query does not exist." %
                res.model._meta.object_name
            )
        return res.first()

    def resolve_contents(self, info, **kwargs):
        return fetch_contents(
            info.context,
            info_include=kwargs.get("info_include"),
            info_exclude=kwargs.get("info_exclude")
        )


class Mutation():
    update_content = ContentMutation.Field()
    update_component = ComponentMutation.Field()
    push_content = PushContentMutation.Field()
    regenerate_flexid = RegenerateFlexidMutation.Field()
