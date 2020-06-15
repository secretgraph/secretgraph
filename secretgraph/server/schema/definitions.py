from uuid import UUID
import graphene
from django.conf import settings
from django.shortcuts import resolve_url
from graphene import ObjectType, relay
from graphene.types.generic import GenericScalar
from graphene_django import DjangoConnectionField, DjangoObjectType
from graphql_relay import from_global_id

from ..actions.view import fetch_clusters, fetch_contents
from ..models import Cluster, Content, ContentReference


class RegisterUrl(GenericScalar):
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


class SecretgraphConfig(ObjectType):
    hashAlgorithms = graphene.List(graphene.String)
    PBKDF2Iterations = graphene.List(graphene.Int)
    injectedClusters = graphene.List(graphene.String)
    registerUrl = graphene.Field(RegisterUrl)
    loginUrl = graphene.String(required=False)

    def resolve_hashAlgorithms(self, info):
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    def resolve_PBKDF2Iterations(self, info):
        return settings.SECRETGRAPH_ITERATIONS

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

    def resolve_loginUrl(self, info):
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            return resolve_url(login_url)
        return None


class FlexidMixin():
    # exposed id is flexid

    def resolve_id(self, info):
        return self.flexid

    @classmethod
    def get_node(cls, info, id):
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            id = UUID(id)
        except ValueError:
            raise ValueError("Malformed id")
        try:
            return queryset.get(flexid=id)
        except cls._meta.model.DoesNotExist:
            return None


class ActionEntry(graphene.ObjectType):
    keyHash = graphene.String()
    type = graphene.String()


class ActionMixin(object):
    availableActions = graphene.List(ActionEntry)

    def resolve_availableActions(self, info, result_key):
        result = getattr(info, "secretgraphResult", {})
        resultval = result.get(
            result_key, {}
        ).get(self.id, {}).items()
        # only show some actions
        resultval = filter(lambda x: x[1][0] in {
            "manage", "push", "view", "update"
        }, resultval)
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
            self, info, "action_types_contents"
        )


class ContentConnectionField(DjangoConnectionField):
    def __init__(self, type=ContentNode, *args, **kwargs):
        kwargs.setdefault("includeInfo", graphene.List(
            graphene.String, required=False
        ))
        kwargs.setdefault("excludeInfo", graphene.List(
            graphene.String, required=False
        ))
        kwargs.setdefault("public", graphene.Boolean(required=False))
        kwargs.setdefault("cluster", graphene.ID(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public")
        cluster = args.get("cluster")
        if cluster:
            _type = "Cluster"
            try:
                _type, cluster = from_global_id(cluster)[1]
            except Exception:
                pass
            if _type != "Cluster":
                raise ValueError("Not a cluster id")
            queryset = queryset.filter(flexid=cluster)
        if public in {True, False}:
            if public:
                queryset = queryset.filter(info__tag="state=public")
            else:
                queryset = queryset.exclude(info__tag="state=public")

        return fetch_contents(
            info.context,
            queryset,
            info_include=args.get("infoInclude"),
            info_exclude=args.get("infoExclude")
        )["objects"]


class ContentReferenceNode(DjangoObjectType):
    class Meta:
        model = ContentReference
        name = "ContentReference"
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
        name = "Cluster"
        interfaces = (relay.Node,)
        fields = ['publicInfo', 'contents', 'group']
    contents = ContentConnectionField()
    user = relay.GlobalID(required=False)

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
            self, info, "action_types_clusters"
        )


class ClusterConnectionField(DjangoConnectionField):
    def __init__(self, type=ClusterNode, *args, **kwargs):
        kwargs.setdefault("user", graphene.ID(required=False))
        kwargs.setdefault("public", graphene.Boolean(required=False))
        kwargs.setdefault("featured", graphene.Boolean(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public")
        featured = args.get("featured", False)
        user = args.get("user")
        if featured and public is None:
            public = True
        if user:
            if (
                not getattr(settings, "AUTH_USER_MODEL", None) and
                not getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
            ):
                raise ValueError("Users are not supported")
            try:
                user = from_global_id(user)[1]
            except Exception:
                pass
            queryset = queryset.filter(user__pk=user)
        if public in {True, False}:
            queryset = queryset.filter(public=public)

        return fetch_clusters(
            info.context,
            queryset,
            info_include=args.get("infoInclude"),
            info_exclude=args.get("infoExclude")
        )["objects"]


class FlexidType(graphene.Union):
    class Meta:
        types = (ClusterNode, ContentNode)
