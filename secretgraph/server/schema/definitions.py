import graphene
from django.conf import settings
from graphene import relay, ObjectType
from graphene_django import DjangoObjectType

from ..actions.view import fetch_contents
from ..models import Component, Content, ContentReference


class ServerConfig(ObjectType):
    key_iterations = graphene.Int()


class FlexidMixin():
    # exposed id is flexid

    def resolve_id(self, info):
        return self.flexid

    @classmethod
    def get_node(cls, info, id):
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            return queryset.get(flexid=id)
        except cls._meta.model.DoesNotExist:
            return None


class ContentNode(FlexidMixin, DjangoObjectType):
    class Meta:
        model = Content
        name = "Content"
        interfaces = (relay.Node,)
        fields = [
            'nonce', 'updated', 'component', 'references', 'referenced_by'
        ]

    info = graphene.List(graphene.String)
    link = graphene.String()

    def resolve_info(self, info):
        return self.info.all().values_list("tag", flat=True)

    def resolve_link(self, info):
        # url to
        return self.file.url


class ContentConnection(relay.Connection):
    include_info = graphene.List(graphene.String)
    exclude_info = graphene.List(graphene.String)
    component = graphene.ID()

    class Meta:
        node = ContentNode


class ContentReferenceNode(DjangoObjectType):
    class Meta:
        model = ContentReference
        interfaces = (relay.Node,)
        fields = ['source', 'target', 'group', 'extra', 'delete_recursive']

    def resolve_id(self, info):
        return f"{self.source.flexid}:{self.target.flexid}:{self.group}"

    @classmethod
    def get_node(cls, info, id):
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            source, target, group = id.split(":", 2)
            return queryset.get(
                source__flexid=source, target__flexid=target, group=group
            )
        except cls._meta.model.DoesNotExist:
            return None
        except ValueError:
            return None


class ComponentNode(FlexidMixin, DjangoObjectType):
    class Meta:
        model = Component
        interfaces = (relay.Node,)
        fields = ['public_info', 'contents']
        if (
            getattr(settings, "AUTH_USER_MODEL", None) or
            getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
        ):
            fields.append("user")
    contents = ContentConnection()

    def resolve_contents(
        self, info, **kwargs
    ):
        return fetch_contents(
            info.context,
            info_include=kwargs.get("info_include"),
            infoexclude=kwargs.get("info_exclude")
        )


class ComponentConnection(relay.Connection):
    if (
        getattr(settings, "AUTH_USER_MODEL", None) or
        getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
    ):
        user = graphene.ID()

    class Meta:
        node = ComponentNode


class FlexidType(graphene.Union):
    class Meta:
        types = (ComponentNode, ContentNode)
