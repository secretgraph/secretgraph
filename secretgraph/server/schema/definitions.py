import graphene
from django.conf import settings
from graphene import relay
from graphene_django import DjangoObjectType

from .models import Component, Content, ContentReference


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
            'info__tag': ['startswith'],
        }
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


class ContentReferenceNode(DjangoObjectType):
    class Meta:
        model = ContentReference
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
        fields = ['public_info']
        filter_fields = {}
        if (
            getattr(settings, "AUTH_USER_MODEL", None) or
            getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
        ):
            fields.append("user")
            filter_fields["user"] = ["exact"]


class FlexidType(graphene.Union):
    class Meta:
        types = (Component, ContentNode)


class InsertMode(graphene.Enum):
    ADD = 0
    REPLACE = 1
    REPLACE_PARTLY = 2
