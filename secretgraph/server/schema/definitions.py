import graphene
from django.db.models import Subquery, Q
from django.conf import settings
from django.shortcuts import resolve_url
from graphene import ObjectType, relay
from graphene.types.generic import GenericScalar
from graphene_django import DjangoConnectionField, DjangoObjectType
from graphql_relay import from_global_id
from django.utils.translation import gettext_lazy as _

from ..utils.auth import initializeCachedResult, fetch_by_id
from ..messages import injection_group_help
from ..actions.view import fetch_clusters, fetch_contents
from ..models import Cluster, Content, ContentReference


# why?: scalars cannot be used in Unions
class RegisterUrl(GenericScalar):
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


class KeyLink(graphene.ObjectType):
    hash = graphene.String()
    link = graphene.String()


class ClusterGroupEntry(graphene.ObjectType):
    group = graphene.String()
    clusters = graphene.List(graphene.ID)
    keys = graphene.List(KeyLink, description="Links to injected keys")

    def resolve_keys(self, info):
        return map(
            lambda x: KeyLink(link=x.link, hash=x.contentHash),
            Content.objects.injected_keys(group=self.group).only(
                "flexid", "contentHash"
            ),
        )


class SecretgraphConfig(ObjectType):
    id = graphene.ID()
    hashAlgorithms = graphene.List(graphene.String)
    PBKDF2Iterations = graphene.List(graphene.Int)
    injectedClusters = graphene.List(ClusterGroupEntry)
    registerUrl = graphene.Field(RegisterUrl)
    loginUrl = graphene.String(required=False)

    def resolve_id(self, info):
        return getattr(settings, "LAST_CONFIG_RELOAD", None)

    def resolve_hashAlgorithms(self, info):
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    def resolve_PBKDF2Iterations(self, info):
        return settings.SECRETGRAPH_ITERATIONS

    def resolve_injectedClusters(self, info):
        return map(
            lambda key_val: ClusterGroupEntry(
                group=key_val[0], clusters=key_val[1]
            ),
            (
                getattr(settings, "SECRETGRAPH_INJECT_CLUSTERS", None) or {}
            ).items(),
        )

    def resolve_registerUrl(self, info):
        if getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False) is not True:
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


class FlexidMixin:
    # exposed id is flexid

    def resolve_id(self, info):
        return self.flexid

    @classmethod
    def get_node(cls, info, id, **kwargs):
        raise NotImplementedError()


class ActionEntry(graphene.ObjectType):
    # of action key
    keyHash = graphene.String()
    type = graphene.String()
    # of content keys
    requiredKeys = graphene.List(graphene.String)
    allowedTags = graphene.List(graphene.String, required=False)


class ActionMixin(object):
    availableActions = graphene.List(ActionEntry)

    def resolve_availableActions(self, info):
        name = self.__class__.__name__
        result = getattr(info.context, "secretgraphResult", {}).get(name, {})
        resultval = (
            result.get("required_keys_%ss" % name.lower(), {})
            .get(self.id, {})
            .items()
        )
        # only show some actions
        # we cannot seperate with lambda. They appear as list
        resultval = filter(
            lambda key_val: key_val[0][0]
            in {"manage", "push", "view", "update"},
            resultval,
        )
        # we cannot seperate with lambda. They appear as list
        return map(
            lambda key_val: ActionEntry(
                keyHash=key_val[0][1],
                type=key_val[0][0],
                requiredKeys=key_val[1]["requiredKeys"],
                allowedTags=(
                    key_val[1]["allowedTags"]
                    if key_val[0][0] != "view"
                    else None
                ),
            ),
            resultval,
        )


class ContentReferenceNode(DjangoObjectType):
    class Meta:
        model = ContentReference
        name = "ContentReference"
        interfaces = (relay.Node,)
        fields = ["source", "target", "group", "extra", "deleteRecursive"]

    def resolve_id(self, info):
        return f"{self.source.flexid}:{self.target.flexid}:{self.group}"

    @classmethod
    def get_node(cls, info, id, authorization=None):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            source, target, group = id.split(":", 2)
            return queryset.get(
                source__in=fetch_contents(
                    result["objects"], result["actions"], source, noFetch=True
                ),
                target__in=fetch_contents(
                    result["objects"], result["actions"], target, noFetch=True
                ),
                group=group,
            )
        except cls._meta.model.DoesNotExist:
            return None
        except ValueError:
            return None

    def resolve_source(self, info, authorization=None, **kwargs):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return fetch_contents(
            result["objects"].filter(references=self),
            result["actions"],
        ).first()

    def resolve_target(self, info, authorization=None, **kwargs):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return fetch_contents(
            result["objects"].filter(referencedBy=self),
            result["actions"],
        ).first()


class ContentReferenceConnectionField(DjangoConnectionField):
    def __init__(self, of_type=ContentReferenceNode, *args, **kwargs):
        kwargs.setdefault(
            "includeTags", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault(
            "excludeTags", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault(
            "contentHashes", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault(
            "groups", graphene.List(graphene.String, required=False)
        )
        super().__init__(of_type, *args, **kwargs)


class ContentNode(ActionMixin, FlexidMixin, DjangoObjectType):
    class Meta:
        model = Content
        name = "Content"
        interfaces = (relay.Node,)
        fields = ["nonce", "updated", "contentHash", "updateId"]

    cluster = graphene.Field(lambda: ClusterNode)
    references = ContentReferenceConnectionField()
    referencedBy = ContentReferenceConnectionField()
    tags = graphene.Field(
        graphene.List(graphene.String),
        includeTags=graphene.List(graphene.String, required=False),
        excludeTags=graphene.List(graphene.String, required=False),
    )
    signatures = graphene.Field(
        graphene.List(graphene.String),
        includeAlgos=graphene.List(graphene.String, required=False),
    )
    link = graphene.String()
    group = graphene.String(description=injection_group_help)

    keys = graphene.List(KeyLink, description="Links to keys")

    @classmethod
    def get_node(cls, info, id, authorization=None, **kwargs):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return fetch_contents(
            result["objects"], result["actions"], str(id)
        ).first()

    def resolve_references(
        self, info, authorization=None, groups=None, **kwargs
    ):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return ContentReference.objects.filter(
            source=self,
            target__in=fetch_contents(
                result["objects"],
                result["actions"],
                includeTags=kwargs.get("tagsInclude"),
                excludeTags=kwargs.get("tagsExclude"),
                contentHashes=kwargs.get("contentHashes"),
                noFetch=True,
            ),
            **({} if groups is None else {"group__in": groups}),
        )

    def resolve_referencedBy(
        self, info, authorization=None, groups=None, **kwargs
    ):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return ContentReference.objects.filter(
            target=self,
            source__in=fetch_contents(
                result["objects"],
                result["actions"],
                includeTags=kwargs.get("tagsInclude"),
                excludeTags=kwargs.get("tagsExclude"),
                contentHashes=kwargs.get("contentHashes"),
                noFetch=True,
            ),
            **({} if groups is None else {"group__in": groups}),
        )

    def resolve_cluster(self, info, authorization=None):
        # authorization often cannot be used, but it is ok, we have cache then
        return (
            initializeCachedResult(info.context, authset=authorization)[
                "Cluster"
            ]["objects"]
            .filter(id=self.cluster_id)
            .first()
        )

    def resolve_tags(self, info, includeTags=None, excludeTags=None):
        incl_filters = Q()
        excl_filters = Q()
        for i in includeTags or []:
            incl_filters |= Q(tag__startswith=i)

        for i in excludeTags or []:
            excl_filters |= Q(tag__startswith=i)
        return self.tags.filter(~excl_filters & incl_filters).values_list(
            "tag", flat=True
        )

    def resolve_signatures(self, info, authorization=None, includeAlgos=None):
        # authorization often cannot be used, but it is ok, we have cache then
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return self.signatures(
            includeAlgos,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    def resolve_link(self, info):
        return self.link

    def resolve_group(self, info):
        return self.group

    def resolve_keys(self, info, authorization=None):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return map(
            lambda x: KeyLink(link=x.link, hash=x.contentHash),
            result["Cluster"]
            .filter(cluster_id=self.cluster_id, tags__tag="type=PublicKey")
            .only("flexid", "contentHash"),
        )

    def resolve_availableActions(self, info):
        return ActionMixin.resolve_availableActions(self, info)


class ContentConnectionField(DjangoConnectionField):
    def __init__(self, type=ContentNode, *args, **kwargs):
        kwargs.setdefault(
            "includeTags", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault(
            "excludeTags", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault(
            "contentHashes", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault("public", graphene.Boolean(required=False))
        kwargs.setdefault("minUpdated", graphene.DateTime(required=False))
        kwargs.setdefault("maxUpdated", graphene.DateTime(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public")
        clusters = args.get("clusters")
        if clusters:
            queryset = fetch_by_id(
                queryset,
                clusters,
                prefix="cluster__",
                type_name="Cluster",
                limit_ids=10,
            )
        if public in {True, False}:
            if public:
                queryset = queryset.filter(tags__tag="state=public")
            else:
                queryset = queryset.exclude(tags__tag="state=public")
        result = initializeCachedResult(
            info.context, authset=args.get("authorization")
        )["Content"]
        queryset = queryset.filter(
            id__in=Subquery(result["objects"].values("id"))
        )

        return fetch_contents(
            queryset,
            result["actions"],
            includeTags=args.get("includeTags"),
            excludeTags=args.get("excludeTags"),
            minUpdated=args.get("minUpdated"),
            maxUpdated=args.get("maxUpdated"),
            contentHashes=args.get("contentHashes"),
        )


class ClusterNode(ActionMixin, FlexidMixin, DjangoObjectType):
    class Meta:
        model = Cluster
        name = "Cluster"
        interfaces = (relay.Node,)
        fields = ["group", "updated", "updateId"]

    contents = ContentConnectionField()
    user = relay.GlobalID(required=False)
    publicInfo = graphene.String(required=False)
    link = graphene.String(
        required=False,
        description=_("Link to turtle document with injected Contents"),
    )

    @classmethod
    def get_node(cls, info, id, authorization=None, **kwargs):
        return fetch_clusters(
            initializeCachedResult(info.context, authset=authorization)[
                "Cluster"
            ]["objects"],
            str(id),
        ).first()

    def resolve_contents(self, info, **kwargs):
        result = initializeCachedResult(
            info.context, authset=kwargs.get("authorization")
        )["Content"]
        return fetch_contents(
            result["objects"],
            result["actions"],
            includeTags=kwargs.get("tagsInclude"),
            excludeTags=kwargs.get("tagsExclude"),
            contentHashes=kwargs.get("contentHashes"),
        )

    def resolve_user(self, info, **kwargs):
        if not hasattr(self, "user"):
            return None
        return self.user

    def resolve_availableActions(self, info):
        return ActionMixin.resolve_availableActions(self, info)

    def resolve_publicInfo(self, info):
        return self.publicInfo.open("r").read()

    def resolve_link(self, info):
        return self.link


class ClusterConnectionField(DjangoConnectionField):
    def __init__(self, type=ClusterNode, *args, **kwargs):
        kwargs.setdefault(
            "includeTags", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault(
            "excludeTags", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault(
            "contentHashes", graphene.List(graphene.String, required=False)
        )
        kwargs.setdefault("user", graphene.ID(required=False))
        kwargs.setdefault("public", graphene.Boolean(required=False))
        kwargs.setdefault("featured", graphene.Boolean(required=False))
        kwargs.setdefault("minUpdated", graphene.DateTime(required=False))
        kwargs.setdefault("maxUpdated", graphene.DateTime(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public")
        featured = args.get("featured", False)
        user = args.get("user")
        if featured and public is None:
            public = True
        if user:
            if not getattr(settings, "AUTH_USER_MODEL", None) and not getattr(
                settings, "SECRETGRAPH_BIND_TO_USER", False
            ):
                # users are not supported in this configuration so ignore them
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
            includeTags=args.get("includeTags"),
            excludeTags=args.get("excludeTags"),
            minUpdated=args.get("minUpdated"),
            maxUpdated=args.get("maxUpdated"),
            contentHashes=args.get("contentHashes"),
        )


class FlexidType(graphene.Union):
    class Meta:
        types = (ClusterNode, ContentNode)
