import graphene
from itertools import chain
from django.db.models import Subquery, Q
from django.conf import settings
from django.shortcuts import resolve_url
from graphene import ObjectType, relay
from graphene.types.generic import GenericScalar
from graphene_django import DjangoConnectionField, DjangoObjectType
from graphql_relay import from_global_id
from django.utils.translation import gettext_lazy as _

from ..utils.auth import initializeCachedResult, fetch_by_id
from ..actions.view import fetch_clusters, fetch_contents
from ..models import Action, Cluster, Content, ContentReference
from .shared import DeleteRecursive


# why?: scalars cannot be used in Unions
class RegisterUrl(GenericScalar):
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


class KeyLink(graphene.ObjectType):
    hash = graphene.String(required=True)
    link = graphene.String(required=True)


class ClusterGroupEntry(graphene.ObjectType):
    group = graphene.String(required=True)
    clusters = graphene.List(graphene.NonNull(graphene.ID), required=True)
    keys = graphene.List(
        graphene.NonNull(KeyLink),
        required=True,
        description="Links to injected keys",
    )

    def resolve_keys(self, info):
        return map(
            lambda x: KeyLink(link=x.link, hash=x.contentHash),
            Content.objects.injected_keys(group=self.group).only(
                "flexid", "contentHash"
            ),
        )


class SecretgraphConfig(ObjectType):
    id = graphene.ID(required=True)
    hashAlgorithms = graphene.List(
        graphene.NonNull(graphene.String), required=True
    )
    injectedClusters = graphene.List(
        graphene.NonNull(ClusterGroupEntry), required=True
    )
    registerUrl = graphene.Field(RegisterUrl, required=False)
    loginUrl = graphene.String(required=False)

    def resolve_id(self, info):
        return getattr(settings, "LAST_CONFIG_RELOAD", None) or ""

    def resolve_hashAlgorithms(self, info):
        return settings.SECRETGRAPH_HASH_ALGORITHMS

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
        if self.limited:
            return None
        return self.flexid

    @classmethod
    def get_node(cls, info, id, **kwargs):
        raise NotImplementedError()


class ActionEntry(graphene.ObjectType):
    id = graphene.ID(required=True)
    # of action key
    keyHash = graphene.String(required=True)
    type = graphene.String(required=True)
    # of content keys
    requiredKeys = graphene.List(
        graphene.NonNull(graphene.String), required=True
    )
    allowedTags = graphene.List(
        graphene.NonNull(graphene.String), required=False
    )


class ActionMixin(object):
    availableActions = graphene.List(graphene.NonNull(ActionEntry))

    def resolve_availableActions(self, info):
        name = self.__class__.__name__
        result = getattr(info.context, "secretgraphResult", {}).get(name, {})
        resultval = []
        # only show some actions
        has_manage = False
        mapper = result.get("required_keys_%ss" % name.lower(), {}).get(
            self.id, {}
        )
        ids = set()
        for key_val in mapper.items():
            if key_val[0][0] in {"manage", "push", "view", "update"}:
                ids.add(key_val[1]["id"])
                if key_val[0][0] == "manage":
                    has_manage = True
        resultval = map(
            lambda key_val: ActionEntry(
                id=None if not has_manage else key_val[1]["id"],
                keyHash=key_val[0][1],
                type=key_val[0][0],
                requiredKeys=key_val[1]["requiredKeys"],
                allowedTags=(
                    key_val[1]["allowedTags"]
                    if key_val[0][0] != "view"
                    else None
                ),
            ),
            filter(lambda key_val: key_val[1]["id"] in ids, mapper.items()),
        )
        if has_manage:
            if isinstance(self, Content):
                resultval = chain(
                    resultval,
                    getattr(info.context, "secretgraphResult", {})
                    .get("Action", {"objects": Action.objects.none()})
                    .filter(
                        Q(contentAction__isnull=True)
                        | Q(contentAction__content_id=self.id),
                        cluster_id=self.cluster_id,
                    )
                    .exclude(id__in=ids)
                    .map(
                        lambda x: ActionEntry(
                            id=x.id,
                            keyHash=x.keyHash,
                            type="other",
                            requiredKeys=[],
                            allowedTags=None,
                        )
                    ),
                )
            else:
                resultval = chain(
                    resultval,
                    map(
                        lambda x: ActionEntry(
                            id=x.id,
                            keyHash=x.keyHash,
                            type="other",
                            requiredKeys=[],
                            allowedTags=None,
                        ),
                        getattr(info.context, "secretgraphResult", {})
                        .get("Action", {"objects": Action.objects.none()})[
                            "objects"
                        ]
                        .filter(contentAction__isnull=True, cluster_id=self.id)
                        .exclude(id__in=ids),
                    ),
                )
        return resultval


class ContentReferenceNode(DjangoObjectType):
    class Meta:
        model = ContentReference
        name = "ContentReference"
        interfaces = (relay.Node,)
        fields = ["source", "target", "group", "extra"]

    deleteRecursive = DeleteRecursive(required=True)

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

    def resolve_deleteRecursive(self, info):
        return self.deleteRecursive

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
            "includeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "contentHashes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "groups",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault("deleted", graphene.Boolean(required=False))
        super().__init__(of_type, *args, **kwargs)


class ContentNode(ActionMixin, FlexidMixin, DjangoObjectType):
    class Meta:
        model = Content
        name = "Content"
        interfaces = (relay.Node,)
        fields = [
            "nonce",
            "updated",
            "contentHash",
            "updateId",
        ]

    deleted = graphene.DateTime(required=False)
    cluster = graphene.Field(lambda: ClusterNode, required=True)
    references = ContentReferenceConnectionField(required=True)
    referencedBy = ContentReferenceConnectionField(required=True)
    tags = graphene.Field(
        graphene.List(graphene.NonNull(graphene.String), required=True),
        includeTags=graphene.List(
            graphene.NonNull(graphene.String), required=False
        ),
        excludeTags=graphene.List(
            graphene.NonNull(graphene.String), required=False
        ),
    )
    signatures = graphene.Field(
        graphene.List(graphene.NonNull(graphene.String), required=True),
        includeAlgorithms=graphene.List(
            graphene.NonNull(graphene.String), required=False
        ),
    )
    link = graphene.String(required=True)

    @classmethod
    def get_node(cls, info, id, authorization=None, **kwargs):
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return fetch_contents(
            result["objects"], result["actions"], id=str(id)
        ).first()

    def resolve_deleted(self, info, **kwargs):
        # if self.limited:
        #    return None
        return self.markForDestruction

    def resolve_references(
        self, info, authorization=None, groups=None, deleted=None, **kwargs
    ):
        if self.limited:
            return ContentReference.objects.none()
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        query = result["objects"]
        if deleted is not None:
            query = result["objects"].filter(
                markForDestruction__isnull=not deleted
            )
        return ContentReference.objects.filter(
            source=self,
            target__in=fetch_contents(
                query,
                result["actions"],
                includeTags=kwargs.get("tagsInclude"),
                excludeTags=kwargs.get("tagsExclude"),
                contentHashes=kwargs.get("contentHashes"),
                noFetch=True,
            ),
            **({} if groups is None else {"group__in": groups}),
        )

    def resolve_referencedBy(
        self, info, authorization=None, groups=None, deleted=None, **kwargs
    ):
        if self.limited:
            return ContentReference.objects.none()
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        query = result["objects"]
        if deleted is not None:
            query = result["objects"].filter(
                markForDestruction__isnull=not deleted
            )

        return ContentReference.objects.filter(
            target=self,
            source__in=fetch_contents(
                query,
                result["actions"],
                includeTags=kwargs.get("tagsInclude"),
                excludeTags=kwargs.get("tagsExclude"),
                contentHashes=kwargs.get("contentHashes"),
                noFetch=True,
            ),
            **({} if groups is None else {"group__in": groups}),
        )

    def resolve_cluster(self, info, authorization=None):
        if self.limited:
            return None
        # authorization often cannot be used, but it is ok, we have cache then
        res = (
            initializeCachedResult(info.context, authset=authorization)[
                "Cluster"
            ]["objects"]
            .filter(id=self.cluster_id)
            .first()
        )
        if not res:
            res = Cluster.objects.get(id=self.cluster_id)
            res.limited = True
        return res

    def resolve_tags(self, info, includeTags=None, excludeTags=None):
        incl_filters = Q()
        excl_filters = Q()
        for i in includeTags or []:
            incl_filters |= Q(tag__startswith=i)

        for i in excludeTags or []:
            excl_filters |= Q(tag__startswith=i)
        tags = self.tags.filter(~excl_filters & incl_filters).values_list(
            "tag", flat=True
        )
        if self.limited:
            tags.filter(
                Q(tag__startswith="key_hash=")
                | Q(tag__startswith="type=")
                | Q(tag__startswith="state=")
            )
        return tags

    def resolve_signatures(
        self, info, authorization=None, includeAlgorithms=None
    ):
        # authorization often cannot be used, but it is ok, we have cache then
        result = initializeCachedResult(info.context, authset=authorization)[
            "Content"
        ]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    def resolve_link(self, info):
        return self.link

    def resolve_availableActions(self, info):
        if self.limited:
            return []
        return ActionMixin.resolve_availableActions(self, info)


class ContentConnectionField(DjangoConnectionField):
    def __init__(self, type=ContentNode, *args, **kwargs):
        kwargs.setdefault(
            "includeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "contentHashes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault("public", graphene.Boolean(required=False))
        kwargs.setdefault("deleted", graphene.Boolean(required=False))
        kwargs.setdefault("minUpdated", graphene.DateTime(required=False))
        kwargs.setdefault("maxUpdated", graphene.DateTime(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public")
        clusters = args.get("clusters")
        deleted = args.get("deleted")
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

        if deleted is not None:
            queryset = queryset.filter(markForDestruction__isnull=not deleted)
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
        fields = ["group"]

    contents = ContentConnectionField(required=True)
    deleted = graphene.DateTime(required=False)
    updated = graphene.DateTime(required=True)
    updateId = graphene.UUID(required=True)
    # MAYBE: reference user directly if possible
    user = relay.GlobalID(required=False)
    publicInfo = graphene.String(required=False)
    link = graphene.String(
        required=True,
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
        contents = result["objects"]
        if self.limited:
            contents = contents.filter(tag__tag="type=PublicKey").annotate(
                limited=True
            )
        return fetch_contents(
            contents.filter(cluster_id=self.id),
            result["actions"],
            includeTags=kwargs.get("tagsInclude"),
            excludeTags=kwargs.get("tagsExclude"),
            contentHashes=kwargs.get("contentHashes"),
        )

    def resolve_deleted(self, info, **kwargs):
        if self.limited:
            return None
        return self.markForDestruction

    def resolve_updated(self, info, **kwargs):
        if self.limited:
            return None
        return self.updated

    def resolve_updateId(self, info, **kwargs):
        if self.limited:
            return None
        return self.updateId

    def resolve_user(self, info, **kwargs):
        if self.limited:
            return None
        if not hasattr(self, "user"):
            return None
        return self.user

    def resolve_availableActions(self, info):
        if self.limited:
            return []
        return ActionMixin.resolve_availableActions(self, info)

    def resolve_publicInfo(self, info):
        if self.limited:
            return None
        return self.publicInfo.open("r").read()

    def resolve_link(self, info):
        if self.limited:
            return None
        return self.link


class ClusterConnectionField(DjangoConnectionField):
    def __init__(self, type=ClusterNode, *args, **kwargs):
        kwargs.setdefault(
            "includeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "contentHashes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault("user", graphene.ID(required=False))
        kwargs.setdefault("public", graphene.Boolean(required=False))
        kwargs.setdefault("featured", graphene.Boolean(required=False))
        kwargs.setdefault("deleted", graphene.Boolean(required=False))
        kwargs.setdefault("minUpdated", graphene.DateTime(required=False))
        kwargs.setdefault("maxUpdated", graphene.DateTime(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public")
        featured = args.get("featured", False)
        user = args.get("user")
        deleted = args.get("deleted")
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
        if deleted is not None:
            queryset = queryset.filter(markForDestruction__isnull=not deleted)
        if public in {True, False}:
            queryset = queryset.filter(public=public)

        return fetch_clusters(
            # DECIDE: still required?
            # or better explicit way instead of doing so in cached query?
            # queryset.filter(
            #    id__in=Subquery(
            #        initializeCachedResult(
            #            info.context, authset=args.get("authorization")
            #        )["Cluster"]["objects"].values("id")
            #    )
            # ),
            initializeCachedResult(
                info.context, authset=args.get("authorization")
            )["Cluster"]["objects"],
            includeTags=args.get("includeTags"),
            excludeTags=args.get("excludeTags"),
            minUpdated=args.get("minUpdated"),
            maxUpdated=args.get("maxUpdated"),
            contentHashes=args.get("contentHashes"),
        )


class FlexidType(graphene.Union):
    class Meta:
        types = (ClusterNode, ContentNode)
