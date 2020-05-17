import graphene
from django.conf import settings
from graphene import relay, ObjectType
from graphene_django import DjangoObjectType

from ..actions.view import fetch_contents
from ..models import Cluster, Content, ContentReference


class SecretgraphConfig(ObjectType):
    injectedClusters = graphene.List(graphene.String)

    def resolve_injectedClusters(self, info):
        return getattr(
            settings, "SECRETGRAPH_INJECT_CLUSTERS", None
        ) or []


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
            'nonce', 'updated', 'cluster', 'references', 'referencedBy'
        ]

    info = graphene.List(graphene.String)
    link = graphene.String()

    def resolve_info(self, info):
        return self.info.all().values_list("tag", flat=True)

    def resolve_link(self, info):
        # url to
        return self.file.url


class ContentConnection(relay.Connection):
    includeInfo = graphene.List(graphene.String)
    excludeInfo = graphene.List(graphene.String)
    public = graphene.Boolean(required=False)
    cluster = graphene.ID()

    class Meta:
        node = ContentNode


class ContentReferenceNode(DjangoObjectType):
    class Meta:
        model = ContentReference
        interfaces = (relay.Node,)
        fields = ['source', 'target', 'group', 'extra', 'deleteRecursive']

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


class ClusterNode(FlexidMixin, DjangoObjectType):
    class Meta:
        model = Cluster
        interfaces = (relay.Node,)
        fields = ['publicInfo', 'contents']
    contents = ContentConnection()
    user = relay.Node.Field()

    def resolve_contents(
        self, info, **kwargs
    ):
        return fetch_contents(
            info.context,
            self.contents,
            info_include=kwargs.get("infoInclude"),
            infoexclude=kwargs.get("infoExclude")
        )

    def resolve_user(
        self, info, **kwargs
    ):
        if not hasattr(self, "user"):
            return None
        return self.user


class ClusterConnection(relay.Connection):
    user = graphene.ID(required=False)
    public = graphene.Boolean(required=False)
    featured = graphene.Boolean(required=False)

    class Meta:
        node = ClusterNode


class FlexidType(graphene.Union):
    class Meta:
        types = (ClusterNode, ContentNode)
