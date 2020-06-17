import graphene
from django.db.models import Subquery
from django.conf import settings
from django.shortcuts import resolve_url
from django.urls import reverse
from graphene import ObjectType, relay
from graphene.types.generic import GenericScalar
from graphene_django import DjangoConnectionField, DjangoObjectType
from graphql_relay import from_global_id

from ...utils.auth import initializeCachedResult, fetch_by_id
from ..actions.view import fetch_clusters, fetch_contents
from ..models import Cluster, Content, ContentReference


class RegisterUrl(GenericScalar):
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


class ClusterGroupEntry(graphene.ObjectType):
    group = graphene.String()
    clusters = graphene.List(graphene.String)


class SecretgraphConfig(ObjectType):
    hashAlgorithms = graphene.List(graphene.String)
    PBKDF2Iterations = graphene.List(graphene.Int)
    injectedClusters = graphene.List(ClusterGroupEntry)
    registerUrl = graphene.Field(RegisterUrl)
    loginUrl = graphene.String(required=False)

    def resolve_hashAlgorithms(self, info):
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    def resolve_PBKDF2Iterations(self, info):
        return settings.SECRETGRAPH_ITERATIONS

    def resolve_injectedClusters(self, info):
        return map(
            lambda key, val: ClusterGroupEntry(group=key, clusters=val)
            (
                getattr(
                    settings, "SECRETGRAPH_INJECT_CLUSTERS", None
                ) or {}
            ).items()
        )

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
        return fetch_by_id(
            queryset,
            id
        ).first()


class ActionEntry(graphene.ObjectType):
    keyHash = graphene.String()
    type = graphene.String()


class ActionMixin(object):
    availableActions = graphene.List(ActionEntry)

    def resolve_availableActions(self, info):
        name = self.__class__.__name__
        result = getattr(info.context, "secretgraphResult", {}).get(
            name, {}
        )
        resultval = result.get(
            "action_types_%ss" % name.lower(), {}
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

    def resolve_cluster(self, info, authorization=None):
        return initializeCachedResult(
            info.context, authset=authorization
        )["Cluster"]["objects"].filter(id=self.cluster_id).first()

    def resolve_info(self, info):
        return self.info.all().values_list("tag", flat=True)

    def resolve_link(self, info):
        # path to raw view
        return reverse(
            "secretgraph-rawcontentvalue", kwargs={
                "id": self.flexid
            }
        )

    def resolve_availableActions(self, info):
        return ActionMixin.resolve_availableActions(
            self, info
        )


class ContentConnectionField(DjangoConnectionField):
    def __init__(self, type=ContentNode, *args, **kwargs):
        kwargs.setdefault("includeInfo", graphene.List(
            graphene.String, required=False
        ))
        kwargs.setdefault("excludeInfo", graphene.List(
            graphene.String, required=False
        ))
        kwargs.setdefault("contentHashes", graphene.List(
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
            queryset = fetch_by_id(
                queryset, cluster, prefix="cluster__", type_name="Cluster"
            )
        if public in {True, False}:
            if public:
                queryset = queryset.filter(info__tag="state=public")
            else:
                queryset = queryset.exclude(info__tag="state=public")
        result = initializeCachedResult(
            info.context, authset=args.get("authorization")
        )["Content"]
        queryset = queryset.filter(
            id__in=Subquery(
                result["objects"].values("id")
            )
        )

        return fetch_contents(
            queryset,
            result["actions"],
            info_include=args.get("infoInclude"),
            info_exclude=args.get("infoExclude"),
            content_hashes=args.get("contentHashes")
        )


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
        fields = ['publicInfo', 'group']
    contents = ContentConnectionField()
    user = relay.GlobalID(required=False)

    def resolve_contents(
        self, info, **kwargs
    ):
        result = initializeCachedResult(
            info.context, authset=kwargs.get("authorization")
        )["Content"]
        return fetch_contents(
            result["objects"],
            result["actions"],
            info_include=kwargs.get("infoInclude"),
            info_exclude=kwargs.get("infoExclude"),
            content_hashes=kwargs.get("contentHashes")
        )

    def resolve_user(
        self, info, **kwargs
    ):
        if not hasattr(self, "user"):
            return None
        return self.user

    def resolve_availableActions(self, info):
        return ActionMixin.resolve_availableActions(
            self, info
        )


class ClusterConnectionField(DjangoConnectionField):
    def __init__(self, type=ClusterNode, *args, **kwargs):
        kwargs.setdefault("includeInfo", graphene.List(
            graphene.String, required=False
        ))
        kwargs.setdefault("excludeInfo", graphene.List(
            graphene.String, required=False
        ))
        kwargs.setdefault("contentHashes", graphene.List(
            graphene.String, required=False
        ))
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
                # users are not supported so ignore them
                user = None
            else:
                try:
                    user = from_global_id(user)[1]
                except Exception:
                    pass
                queryset = queryset.filter(user__pk=user)
        if public in {True, False}:
            queryset = queryset.filter(public=public)

        return fetch_clusters(
            queryset.filter(
                id__in=Subquery(
                    initializeCachedResult(
                        info.context, authset=args.get("authorization")
                    )["Cluster"]["objects"].values("id")
                )
            ),
            info_include=args.get("infoInclude"),
            info_exclude=args.get("infoExclude"),
            content_hashes=args.get("contentHashes")
        )


class FlexidType(graphene.Union):
    class Meta:
        types = (ClusterNode, ContentNode)
