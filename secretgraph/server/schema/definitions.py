from __future__ import annotations
from typing import Optional, Union, List
from datetime import datetime
import strawberry
from strawberry.types import Info
from strawberry.fields import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q
from django.conf import settings
from django.shortcuts import resolve_url

from ... import constants
from ..utils.auth import get_cached_result, fetch_by_id
from ..actions.view import fetch_clusters, fetch_contents
from ..models import (
    Action,
    Cluster,
    Content,
    ContentReference,
    GlobalGroup,
    GlobalGroupProperty,
)
from .shared import DeleteRecursive, UseCriteria, UseCriteriaPublic


# why?: scalars cannot be used in Unions


@strawberry.scalar
class RegisterUrl:
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


@gql.django.type(Content, name="InjectedKey")
class InjectedKeyNode(relay.Node):

    link: gql.auto
    hash: gql.auto = gql.django.field(field_name="contentHash")

    @staticmethod
    def resolve_id(root) -> str:
        return root.flexid


@gql.django.type(GlobalGroupProperty, name="GlobalGroupProperty")
class GlobalGroupPropertyNode(relay.Node):
    name: gql.auto
    description: gql.auto


@gql.django.type(GlobalGroup, name="GlobalGroup")
class GlobalGroupNode(relay.Node):

    name: gql.auto
    description: gql.auto
    hidden: gql.auto
    matchUserGroup: gql.auto
    clusters: gql.auto
    injected_keys: gql.auto

    @gql.django.field(only=["properties"])
    def properties(self) -> List[str]:
        return self.properties.values_list("name", flat=True)


@relay.type
class SecretgraphConfig(relay.Node):
    groups: List[GlobalGroupNode] = gql.django.field()

    @staticmethod
    def resolve_id() -> str:
        return getattr(settings, "LAST_CONFIG_RELOAD_ID", "")

    @classmethod
    def resolve_node(
        cls, *, info: Optional[Info] = None, node_id: str, required: bool
    ):
        return cls()

    @strawberry.field
    @staticmethod
    def hashAlgorithms():
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    @strawberry.field
    @staticmethod
    def registerUrl():
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

    @strawberry.field
    @staticmethod
    def loginUrl():
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            return resolve_url(login_url)
        return None


class FlexidMixin:
    # exposed id is flexid
    @staticmethod
    def resolve_id(root):
        if root.limited:
            return None
        return root.flexid


@strawberry.type
class ActionEntry:
    # of action key
    keyHash: str
    type: str
    allowedTags: Optional[List[str]]
    trustedKeys: List[str]


class ActionMixin:
    @gql.django.field(only=["id", "cluster_id"])
    def availableActions(self, info: Info) -> List[ActionEntry]:
        name = self.__class__.__name__
        result = getattr(info.context, "secretgraphResult", {}).get(name, {})
        # only show some actions if not set
        has_manage = False
        if isinstance(self, Content):
            # if content: check cluster and content keys
            mappers = [
                result.get("action_info_contents", {}).get(self.id, {}),
                result.get("action_info_clusters", {}).get(
                    self.cluster_id, {}
                ),
            ]
        else:
            mappers = [result.get("action_info_clusters", {}).get(self.id, {})]
        # auth included unprotected ids
        seen_ids = set()
        # don't copy
        for mapper in mappers:
            for key_val in mapper.items():
                if key_val[0][0] == "manage":
                    has_manage = True
                if key_val[0][0] not in constants.protectedActions:
                    seen_ids.add(key_val[1])
                    yield ActionEntry(
                        keyHash=key_val[0][1],
                        type=key_val[0][0],
                        trustedKeys=(
                            result["decrypted"][key_val[1]].get("trustedKeys")
                            or []
                        ),
                        allowedTags=(
                            result["decrypted"][key_val[1]].get("allowedTags")
                            if key_val[0][0] not in {"view", "auth"}
                            else None
                        ),
                    )
        if has_manage:
            if isinstance(self, Content):
                for action in (
                    result.get("Action", {"objects": Action.objects.none()})[
                        "objects"
                    ]
                    .filter(
                        Q(contentAction__isnull=True)
                        | Q(contentAction__content_id=self.id),
                        cluster_id=self.cluster_id,
                    )
                    .exclude(id__in=seen_ids)
                ):
                    yield ActionEntry(
                        keyHash=action.keyHash,
                        type="other",
                        trustedKeys=(
                            result["decrypted"][key_val[1]].get("trustedKeys")
                            or []
                        ),
                        allowedTags=None,
                    )
            else:
                for action in (
                    result.get("Action", {"objects": Action.objects.none()})[
                        "objects"
                    ]
                    .filter(contentAction__isnull=True, cluster_id=self.id)
                    .exclude(id__in=seen_ids)
                ):
                    yield ActionEntry(
                        keyHash=action.keyHash,
                        type="other",
                        trustedKeys=(
                            result["decrypted"][key_val[1]].get("trustedKeys")
                            or []
                        ),
                        allowedTags=None,
                    )

    @gql.django.field(only=["id", "cluster_id"])
    def authOk(self, info: Info) -> bool:
        name = self.__class__.__name__
        result = getattr(info.context, "secretgraphResult", {}).get(name, {})

        authOk = False
        if isinstance(self, Content):
            # if content: check cluster and content keys
            mappers = [
                result.get("action_info_contents", {}).get(self.id, {}),
                result.get("action_info_clusters", {}).get(
                    self.cluster_id, {}
                ),
            ]
        else:
            mappers = [result.get("action_info_clusters", {}).get(self.id, {})]
        for mapper in mappers:
            for key_val in mapper.items():
                if key_val[0][0] == "auth":
                    authOk = True
                    break
            if authOk:
                break
        return authOk


@gql.django.type(ContentReference, name="ContentReference")
class ContentReferenceNode(relay.Node):
    safe = False

    group: gql.auto
    extra: gql.auto

    deleteRecursive: DeleteRecursive

    @staticmethod
    def resolve_id(root):
        return f"{root.source.flexid}|{root.target.flexid}|{root.group}"

    @classmethod
    def resolve_node(
        cls,
        info: Info,
        id: relay.GlobalID,
    ):
        result = get_cached_result(info.context)["Content"]
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            source, target, group = id.split("|", 2)
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

    @gql.django.field
    def source(self, info: Info) -> ContentNode:
        result = get_cached_result(info.context)["Content"]
        return fetch_contents(
            result["objects"].filter(references=self),
            result["actions"],
        ).first()

    @gql.django.field
    def target(self, info: Info) -> ContentNode:
        result = get_cached_result(info.context)["Content"]
        return fetch_contents(
            result["objects"].filter(referencedBy=self),
            result["actions"],
        ).first()


class ContentReferenceConnectionField(DjangoConnectionField):
    def __init__(self, of_type=ContentReferenceNode, *args, **kwargs):
        kwargs.setdefault(
            "states",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "includeTypes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTypes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
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
        kwargs.setdefault(
            "deleted",
            UseCriteria(required=False, default_value=UseCriteria.FALSE),
        )
        super().__init__(of_type, *args, **kwargs)


@gql.django.type(Content, name="Content")
class ContentNode(ActionMixin, FlexidMixin, relay.Node):
    nonce: gql.auto
    updated: gql.auto
    contentHash: gql.auto
    updateId: gql.auto
    type: gql.auto
    state: gql.auto
    deleted: Optional[datetime] = gql.django.field(
        field_name="markForDestruction"
    )
    link: str

    @gql.django.field()
    def tags(
        self,
        info: Info,
        includeTags: Optional[List[str]] = None,
        excludeTags: Optional[List[str]] = None,
    ) -> List[str]:
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
                Q(tag__startswith="key_hash=") | Q(tag__startswith="name=")
            )
        return tags

    @gql.django.field()
    def signatures(
        self, info: Info, includeAlgorithms: Optional[List[str]] = None
    ) -> List[ContentNode]:
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context)["Content"]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    @gql.django.field()
    def cluster(self, info: Info):
        if self.limited:
            return None
        # authorization often cannot be used, but it is ok, we have cached then
        res = (
            get_cached_result(info.context)["Cluster"]["objects"]
            .filter(id=self.cluster_id)
            .first()
        )
        if not res:
            res = Cluster.objects.get(id=self.cluster_id)
            res.limited = True
        return res

    def availableActions(self, info: Info):
        if self.limited:
            return []
        return ActionMixin.availableActions(self, info)

    #  TODO
    references = ContentReferenceConnectionField(required=True)
    referencedBy = ContentReferenceConnectionField(required=True)

    def resolve_references(
        self,
        info,
        authorization=None,
        groups=None,
        deleted=UseCriteria.FALSE,
        **kwargs,
    ):
        if self.limited or self.cluster_id == 1:
            return ContentReference.objects.none()
        result = get_cached_result(info.context, authset=authorization)[
            "Content"
        ]
        query = result["objects"].exclude(hidden=True)
        if deleted != UseCriteria.IGNORE:
            query = query.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )
        return ContentReference.objects.filter(
            source=self,
            target__in=fetch_contents(
                query,
                result["actions"],
                states=kwargs.get("states"),
                includeTypes=kwargs.get("includeTypes"),
                excludeTypes=kwargs.get("excludeTypes"),
                includeTags=kwargs.get("includeTags"),
                excludeTags=kwargs.get("excludeTags"),
                contentHashes=kwargs.get("contentHashes"),
                noFetch=True,
            ),
            **({} if groups is None else {"group__in": groups}),
        )

    def resolve_referencedBy(
        self,
        info,
        authorization=None,
        groups=None,
        deleted=UseCriteria.FALSE,
        **kwargs,
    ):
        if self.limited or self.cluster_id == 1:
            return ContentReference.objects.none()
        result = get_cached_result(info.context, authset=authorization)[
            "Content"
        ]
        query = result["objects"].exclude(hidden=True)
        if deleted != UseCriteria.IGNORE:
            query = query.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )

        return ContentReference.objects.filter(
            target=self,
            source__in=fetch_contents(
                query,
                result["actions"],
                states=kwargs.get("states"),
                includeTypes=kwargs.get("includeTypes"),
                excludeTypes=kwargs.get("excludeTypes"),
                includeTags=kwargs.get("includeTags"),
                excludeTags=kwargs.get("excludeTags"),
                contentHashes=kwargs.get("contentHashes"),
                noFetch=True,
            ),
            **({} if groups is None else {"group__in": groups}),
        )

    @classmethod
    def resolve_node(cls, info, id, authorization=None, **kwargs):
        result = get_cached_result(info.context, authset=authorization)[
            "Content"
        ]
        return fetch_contents(
            result["objects"], result["actions"], id=str(id)
        ).first()


class ContentConnectionField(DjangoConnectionField):
    def __init__(self, type=ContentNode, *args, subfield=False, **kwargs):
        kwargs.setdefault(
            "states",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "includeTypes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTypes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "includeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTags",
            graphene.List(
                graphene.NonNull(graphene.String),
                required=False,
                description="Use id=xy for excluding content ids",
            ),
        )
        kwargs.setdefault(
            "contentHashes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        if not subfield:
            kwargs.setdefault(
                "clusters", graphene.List(graphene.ID, required=False)
            )
            kwargs.setdefault(
                "public",
                UseCriteriaPublic(
                    required=False, default_value=UseCriteriaPublic.IGNORE
                ),
            )
            kwargs.setdefault(
                "hidden",
                UseCriteria(required=False, default_value=UseCriteria.FALSE),
            )
        kwargs.setdefault(
            "deleted",
            UseCriteria(required=False, default_value=UseCriteria.FALSE),
        )
        kwargs.setdefault("minUpdated", graphene.DateTime(required=False))
        kwargs.setdefault("maxUpdated", graphene.DateTime(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public", UseCriteriaPublic.IGNORE)
        deleted = args.get("deleted", UseCriteria.FALSE)
        hidden = args.get("hidden", UseCriteria.FALSE)
        result = get_cached_result(info.context)["Content"]
        # TODO: perm check for deleted and hidden
        if True:
            hidden = UseCriteria.FALSE
        if isinstance(cls, Cluster):
            clusters = [cls.flexid]
        else:
            clusters = args.get("clusters")
        if clusters:
            queryset = fetch_by_id(
                queryset,
                clusters,
                prefix="cluster__",
                limit_ids=None,
            )
        if public != UseCriteriaPublic.TOKEN:
            pass
        elif public != UseCriteriaPublic.IGNORE:
            # should only include public contents with public cluster
            # if no clusters are specified (e.g. root query)
            if public == UseCriteriaPublic.TRUE:
                if not clusters:
                    queryset = queryset.filter(
                        state__in=constants.public_states,
                        cluster__public=True,
                    )
                else:
                    queryset = queryset.filter(
                        state__in=constants.public_states
                    )
            else:
                queryset = queryset.exclude(state__in=constants.public_states)
        else:
            # only private or public with cluster public
            queryset = queryset.filter(
                ~Q(state__in=constants.public_states) | Q(cluster__public=True)
            )

        if deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )
        if hidden != UseCriteria.IGNORE:
            queryset = queryset.filter(hidden=hidden == UseCriteria.TRUE)
        queryset = queryset.filter(
            id__in=Subquery(
                result[
                    "objects_ignore_public"
                    if public == UseCriteriaPublic.TOKEN
                    else "objects"
                ].values("id")
            )
        )

        return fetch_contents(
            queryset.distinct(),
            result["actions"],
            states=args.get("states"),
            includeTypes=args.get("includeTypes"),
            excludeTypes=args.get("excludeTypes"),
            includeTags=args.get("includeTags"),
            excludeTags=args.get("excludeTags"),
            minUpdated=args.get("minUpdated"),
            maxUpdated=args.get("maxUpdated"),
            contentHashes=args.get("contentHashes"),
        )


@gql.django.type(Cluster, name="Cluster")
class ClusterNode(ActionMixin, FlexidMixin, relay.Node):
    class Meta:
        model = Cluster
        name = "Cluster"
        interfaces = (relay.Node,)
        fields = ["public", "featured"]

    contents = ContentConnectionField(required=True, subfield=True)
    deleted: Optional[datetime]
    updated: datetime
    updateId: UUID
    # MAYBE: reference user directly if possible
    name: str
    description: str
    groups = graphene.List(graphene.NonNull(graphene.String), required=True)

    @classmethod
    def resolve_node(cls, info: Info, id: relay.GlobalID, **kwargs):
        return fetch_clusters(
            get_cached_result(info.context, authset=authorization)["Cluster"][
                "objects"
            ],
            ids=str(id),
        ).first()

    @gql.django.field()
    def featured(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.featured

    @gql.django.field()
    def public(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.public

    @gql.django.field()
    def deleted(self) -> Optional[datetime]:
        if self.limited:
            return None
        return self.markForDestruction

    @gql.django.field()
    def updateId(self) -> Optional[UUID]:
        if self.limited:
            return None
        return self.updateId

    @gql.django.field()
    def user(self) -> Optional[relay.GlobalID]:
        if self.limited:
            return None
        if not hasattr(self, "user"):
            return None
        #
        return self.user

    @gql.django.field()
    @staticmethod
    def resolve_availableActions(self, info):
        if self.limited:
            return []
        return ActionMixin.resolve_availableActions(self, info)

    @gql.django.field()
    @staticmethod
    def resolve_name(self, info):
        if self.limited:
            return None
        return self.name

    @gql.django.field()
    @staticmethod
    def resolve_description(self, info):
        if self.limited:
            return None
        return self.description

    @gql.django.field()
    @staticmethod
    def resolve_groups(self, info):
        if self.limited:
            return None
        # remove hidden
        hidden = GlobalGroup.objects.get_hidden_names()
        return set(self.groups.values_list("name", flat=True)).difference(
            hidden
        )

    def resolve_contents(self, info, **kwargs):
        result = get_cached_result(
            info.context, authset=kwargs.get("authorization")
        )["Content"]
        contents = result["objects"]
        if self.limited:
            contents = contents.annotate(limited=True)
        return fetch_contents(
            contents.filter(cluster_id=self.id),
            result["actions"],
            states=kwargs.get("states"),
            includeTypes=["PublicKey"]
            if self.limited
            else kwargs.get("includeTypes"),
            excludeTypes=kwargs.get("excludeTypes"),
            includeTags=kwargs.get("tagsInclude"),
            excludeTags=kwargs.get("tagsExclude"),
            contentHashes=kwargs.get("contentHashes"),
        )


class ClusterConnectionField(DjangoConnectionField):
    def __init__(self, type=ClusterNode, *args, **kwargs):
        kwargs.setdefault(
            "search",
            graphene.String(
                required=False,
                description=("Search description and id"),
            ),
        )
        kwargs.setdefault(
            "states",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )

        kwargs.setdefault(
            "includeTypes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTypes",
            graphene.List(
                graphene.NonNull(graphene.String),
                required=False,
            ),
        )
        kwargs.setdefault(
            "includeTags",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "excludeTags",
            graphene.List(
                graphene.NonNull(graphene.String),
                required=False,
                description=(
                    "Use id=xy for excluding clusters with content ids"
                ),
            ),
        )
        kwargs.setdefault(
            "excludeIds",
            graphene.List(
                graphene.NonNull(graphene.String),
                required=False,
                description="For excluding clusters with ids",
            ),
        )
        kwargs.setdefault(
            "contentHashes",
            graphene.List(graphene.NonNull(graphene.String), required=False),
        )
        kwargs.setdefault(
            "ids", graphene.List(graphene.NonNull(graphene.ID), required=False)
        )
        kwargs.setdefault("user", graphene.ID(required=False))
        kwargs.setdefault(
            "public",
            UseCriteriaPublic(
                required=False, default_value=UseCriteriaPublic.IGNORE
            ),
        )
        kwargs.setdefault(
            "featured",
            UseCriteria(required=False, default_value=UseCriteria.IGNORE),
        )
        kwargs.setdefault(
            "deleted",
            UseCriteria(required=False, default_value=UseCriteria.FALSE),
        )
        kwargs.setdefault("minUpdated", graphene.DateTime(required=False))
        kwargs.setdefault("maxUpdated", graphene.DateTime(required=False))
        super().__init__(type, *args, **kwargs)

    @classmethod
    def resolve_queryset(cls, connection, queryset, info, args):
        public = args.get("public", UseCriteriaPublic.IGNORE)
        featured = args.get("featured", UseCriteria.IGNORE)
        user = args.get("user")
        deleted = args.get("deleted", UseCriteria.FALSE)
        excludeIds = args.get("excludeIds")
        ids = args.get("ids")
        search = args.get("search")
        if user:
            if not getattr(settings, "AUTH_USER_MODEL", None) and not getattr(
                settings, "SECRETGRAPH_BIND_TO_USER", False
            ):
                # users are not supported in this configuration so ignore them
                user = None
            else:
                try:
                    user = relay.from_base64(user)[1]
                except Exception:
                    pass
                queryset = queryset.filter(user__pk=user)

        if search:
            queryset = queryset.filter(
                Q(flexid_cached__startswith=search)
                | Q(name__icontains=search)
                | Q(description__icontains=search)
            )

        if excludeIds is not None:
            queryset = queryset.exclude(flexid_cached__in=excludeIds)
        if deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )
        if (
            public != UseCriteriaPublic.IGNORE
            and public != UseCriteriaPublic.TOKEN
        ):
            queryset = queryset.filter(public=public == UseCriteriaPublic.TRUE)
        if featured != UseCriteria.IGNORE:
            queryset = queryset.filter(featured=featured == UseCriteria.TRUE)

        return fetch_clusters(
            #  required for enforcing permissions
            queryset.filter(
                id__in=Subquery(
                    get_cached_result(
                        info.context, authset=args.get("authorization")
                    )["Cluster"][
                        "objects_ignore_public"
                        if public == UseCriteriaPublic.TOKEN
                        else "objects"
                    ].values(
                        "id"
                    )
                )
            ).distinct(),
            ids=ids,
            limit_ids=None,
            states=args.get("states"),
            includeTypes=args.get("includeTypes"),
            excludeTypes=args.get("excludeTypes"),
            includeTags=args.get("includeTags"),
            excludeTags=args.get("excludeTags"),
            minUpdated=args.get("minUpdated"),
            maxUpdated=args.get("maxUpdated"),
            contentHashes=args.get("contentHashes"),
        )


FlexidType = Union[ClusterNode, ContentNode]
