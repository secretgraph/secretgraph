import graphene
from django.conf import settings
from django.shortcuts import resolve_url
from graphene import relay, ObjectType
from graphene_django import DjangoObjectType

from graphene.types.generic import GenericScalar

from ..actions.view import fetch_contents
from ..models import Cluster, Content, ContentReference


class RegisterUrl(GenericScalar):
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


class SecretgraphConfig(ObjectType):
    hashAlgorithms = graphene.List(graphene.String)
    injectedClusters = graphene.List(graphene.String)
    registerUrl = graphene.Field(RegisterUrl)

    def resolve_hashAlgorithms(self, info):
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    def resolve_injectedClusters(self, info):
        return getattr(
            settings, "SECRETGRAPH_INJECT_CLUSTERS", None
        ) or []

    def resolve_registerUrl(self, info):
        if getattr(
            settings, "SECRETGRAPH_ALLOW_REGISTER", False
        ) is not True:
            return False
        signup_url = getattr(settings, "SIGNUP_URL", None)
        if (
            getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
            and not signup_url
        ):
            return False
        if signup_url:
            return resolve_url(signup_url)
        return True


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


class ActionEntry(graphene.ObjectType):
    keyHash = graphene.String()
    type = graphene.String()


class ActionMixin(object):
    availableActions = graphene.List(ActionEntry)

    def resolve_availableActions(self, info, result_key, cluster_id):
        result = getattr(info, "secretgraphResult", {})
        resultval = result.get(
            result_key, {}
        ).get(self.id, {}).items()
        # only show some actions
        resultval = filter(lambda x: x[1][0] in {
            "manage", "push", "view", "update"
        }, resultval)
        if ("manage", True) not in result.get(
            "action_types_clusters", {}
        ).get(cluster_id, {}).values():
            resultval = filter(lambda x: x[1][1], resultval)

        return map(
            lambda x: ActionEntry(keyHash=x[0], type=x[1][0]), resultval
        )


class ContentNode(ActionMixin, FlexidMixin, DjangoObjectType):
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

    def resolve_availableActions(self, info):
        return super().resolve_availableActions(
            self, info, "action_types_contents", self.cluster_id
        )


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


class ClusterNode(ActionMixin, FlexidMixin, DjangoObjectType):
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

    def resolve_availableActions(self, info):
        return super().resolve_availableActions(
            self, info, "action_types_clusters", self.id
        )


class ClusterConnection(relay.Connection):
    user = graphene.ID(required=False)
    public = graphene.Boolean(required=False)
    featured = graphene.Boolean(required=False)

    class Meta:
        node = ClusterNode


class FlexidType(graphene.Union):
    class Meta:
        types = (ClusterNode, ContentNode)
