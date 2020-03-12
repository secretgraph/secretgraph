import graphene
from django.conf import settings
from graphene import relay
from graphene_django import DjangoObjectType

from .models import Component, Content, ContentValue, ReferenceContent


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
        filter_fields = {
            'component': ['exact'],
            'values__name': ['exact', 'startswith'],
            'values__search_value': ['exact', 'startswith'],
            'references__name': ['exact', 'startswith']
        }
        interfaces = (relay.Node,)
        fields = [
            'nonce', 'component', 'values', 'references', 'referenced_by'
        ]


class ReferenceContentNode(DjangoObjectType):
    class Meta:
        model = ReferenceContent
        interfaces = (relay.Node,)
        fields = ['source', 'target', 'name', 'delete_recursive']

    def resolve_id(self, info):
        return f"{self.source.flexid}:{self.target.flexid}:{self.name}"

    @classmethod
    def get_node(cls, info, id):
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            source, target, name = id.split(":", 2)
            return queryset.get(
                source__flexid=source, target__flexid=target, name=name
            )
        except cls._meta.model.DoesNotExist:
            return None
        except ValueError:
            return None


class ComponentNode(FlexidMixin, DjangoObjectType):
    class Meta:
        model = Component
        interfaces = (relay.Node,)
        fields = ['public_info', 'nonce']
        filter_fields = {}
        if (
            getattr(settings, "AUTH_USER_MODEL", None) or
            getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
        ):
            fields.append("user")
            filter_fields["user"] = ["exact"]

    def resolve_nonce(self, info):
        passed_component_set = getattr(info, "passed_component_set", set())
        if self.id not in passed_component_set:
            return None
        return self.nonce


class ContentValueNode(FlexidMixin, DjangoObjectType):
    class Meta:
        model = ContentValue
        interfaces = (relay.Node,)
        fields = ['content', 'updated', 'name', 'search_value']

    value = graphene.String(required=True)

    def resolve_value(self, info):
        # url to
        return self.file.url


class FlexidType(graphene.Union):
    class Meta:
        types = (Component, ContentNode, ContentValueNode)


class InsertMode(graphene.Enum):
    ADD = 0
    REPLACE = 1
    REPLACE_PARTLY = 2
