from __future__ import annotations
from typing import Optional, Union, List, Iterable
from datetime import datetime
import strawberry
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q, QuerySet
from django.conf import settings
from django.contrib.auth import get_user_model
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

    link: str

    @gql.django.field(only=["contentHash"])
    def hash(self) -> str:
        return self.contentHash

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        return root.flexid

    def get_queryset(self, queryset, info):
        return queryset.filter(type="PublicKey", injected_for__isnull=False)

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Optional[Info] = None,
        required: bool = False,
    ) -> Optional[ContentNode]:
        query = Content.objects.filter(
            type="PublicKey", injected_for__isnull=False, flexid=node_id
        )
        if required:
            return query.get()
        else:
            return query.first()

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Optional[Info] = None,
        node_ids: Optional[Iterable[str]] = None,
    ) -> None:
        raise NotImplementedError


@gql.django.type(GlobalGroupProperty, name="GlobalGroupProperty")
class GlobalGroupPropertyNode(relay.Node):
    name: str
    description: str


@gql.django.type(GlobalGroup, name="GlobalGroup")
class GlobalGroupNode(relay.Node):

    name: str
    description: str
    hidden: bool
    matchUserGroup: str
    clusters: List[ClusterNode]
    injectedKeys: List[InjectedKeyNode]

    @gql.django.field(only=["properties"])
    def properties(self) -> List[GlobalGroupPropertyNode]:
        return self.properties


@gql.type()
class SecretgraphConfig(relay.Node):
    groups: List[GlobalGroupNode] = gql.django.field(
        default_factory=GlobalGroup.objects.all
    )

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        return getattr(settings, "LAST_CONFIG_RELOAD_ID", "")

    @classmethod
    def resolve_node(
        cls,
        *,
        info: Optional[Info] = None,
        node_id: str,
        required: bool = False,
    ) -> "SecretgraphConfig":
        return cls()

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Optional[Info] = None,
        node_ids: Optional[Iterable[str]] = None,
    ) -> None:
        raise NotImplementedError

    @strawberry.field
    @staticmethod
    def hashAlgorithms() -> List[str]:
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    @strawberry.field
    @staticmethod
    def registerUrl() -> RegisterUrl:
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
    def loginUrl() -> Optional[str]:
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            return resolve_url(login_url)
        return None


@strawberry.type
class ActionEntry:
    # of action key
    keyHash: str
    type: str
    allowedTags: Optional[List[str]]
    trustedKeys: List[str]


class ActionMixin:
    def availableActions(self, info: Info) -> List[ActionEntry]:
        name = self.__class__.__name__
        result = getattr(info.context.request, "secretgraphResult", {}).get(
            name, {}
        )
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
        result = getattr(info.context.request, "secretgraphResult", {}).get(
            name, {}
        )

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


@strawberry.django.filters.filter(ContentReference)
class ContentReferenceFilter:
    # queryset
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = None
    contentHashes: Optional[List[str]] = None
    deleted: UseCriteria = UseCriteria.FALSE

    # classical
    groups: Optional[List[str]] = None

    def filter_states(self, queryset):
        return queryset

    def filter_includeTypes(self, queryset):
        return queryset

    def filter_excludeTypes(self, queryset):
        return queryset

    def filter_includeTags(self, queryset):
        return queryset

    def filter_excludeTags(self, queryset):
        return queryset

    def filter_contentHashes(self, queryset):
        return queryset

    def filter_deleted(self, queryset):
        return queryset

    def filter_groups(self, queryset):
        if self.groups is not None:
            queryset = queryset.filter(group__in=self.groups)
        return queryset


@gql.django.type(
    ContentReference, filters=ContentReferenceFilter, name="ContentReference"
)
class ContentReferenceNode(relay.Node):
    safe = False

    group: str
    extra: str

    deleteRecursive: DeleteRecursive

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        return f"{root.source.flexid}|{root.target.flexid}|{root.group}"

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Info,
        required: bool = False,
    ) -> ContentReferenceNode:
        result = get_cached_result(info.context)["Content"]
        queryset = ContentReference.objects.all()
        try:
            source, target, group = id.node_id.split("|", 2)
            return queryset.get(
                source__in=fetch_contents(
                    result["objects"], result["actions"], source, noFetch=True
                ),
                target__in=fetch_contents(
                    result["objects"], result["actions"], target, noFetch=True
                ),
                group=group,
            )
        except ContentReference.DoesNotExist as exc:
            if required:
                raise exc
            return None
        except ValueError:
            return None

    @gql.django.field
    def source(self, info: Info) -> ContentNode:
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"].filter(references=self),
            result["actions"],
        ).first()

    @gql.django.field
    def target(self, info: Info) -> ContentNode:
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"].filter(referencedBy=self),
            result["actions"],
        ).first()

    def get_queryset(
        self, queryset, info: Info, filters: ContentReferenceFilter
    ) -> QuerySet[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.cluster_id == 1
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context.request)["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}

        if info.field_name == "references":
            filterob["target__in"] = fetch_contents(
                query,
                result["actions"],
                states=filters.states,
                includeTypes=filters.includeTypes,
                excludeTypes=filters.excludeTypes,
                includeTags=filters.includeTags,
                excludeTags=filters.excludeTags,
                contentHashes=filters.contentHashes,
                noFetch=True,
            )
        else:
            filterob["source__in"] = fetch_contents(
                query,
                result["actions"],
                states=filters.states,
                includeTypes=filters.includeTypes,
                excludeTypes=filters.excludeTypes,
                includeTags=filters.includeTags,
                excludeTags=filters.excludeTags,
                contentHashes=filters.contentHashes,
                noFetch=True,
            )
        return queryset.filter(
            **filterob,
        )


@strawberry.django.filters.filter(Content)
class ContentFilterSimple:
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = None
    contentHashes: Optional[List[str]] = None
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None

    def filter_states(self, queryset):
        return queryset

    def filter_includeTypes(self, queryset):
        return queryset

    def filter_excludeTypes(self, queryset):
        return queryset

    def filter_includeTags(self, queryset):
        return queryset

    def filter_excludeTags(self, queryset):
        return queryset

    def filter_contentHashes(self, queryset):
        return queryset

    def filter_minUpdated(self, queryset):
        return queryset

    def filter_maxUpdated(self, queryset):
        return queryset


@strawberry.django.filters.filter(Content)
class ContentFilter:
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = gql.django.field(
        default=None,
        description="Use id=xy for excluding contents with ids",
    )
    contentHashes: Optional[List[str]] = None
    clusters: Optional[List[strawberry.ID]] = None
    hidden: UseCriteria = UseCriteria.FALSE
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None

    def filter_states(self, queryset):
        return queryset

    def filter_includeTypes(self, queryset):
        return queryset

    def filter_excludeTypes(self, queryset):
        return queryset

    def filter_includeTags(self, queryset):
        return queryset

    def filter_excludeTags(self, queryset):
        return queryset

    def filter_contentHashes(self, queryset):
        return queryset

    def filter_deleted(self, queryset):
        return queryset

    def filter_clusters(self, queryset):
        if self.clusters is None:
            return queryset
        return fetch_by_id(
            queryset,
            self.clusters,
            prefix="cluster__",
            limit_ids=None,
        )

    def filter_public(self, queryset):
        if self.public != UseCriteriaPublic.TOKEN:
            pass
        elif self.public != UseCriteriaPublic.IGNORE:
            # should only include public contents with public cluster
            # if no clusters are specified (e.g. root query)
            if self.public == UseCriteriaPublic.TRUE:
                if not self.clusters:
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

    def filter_minUpdated(self, queryset):
        return queryset

    def filter_maxUpdated(self, queryset):
        return queryset


@gql.django.type(Content, name="Content", filters=ContentFilter)
class ContentNode(relay.Node):
    nonce: str
    updated: datetime
    contentHash: str
    updateId: UUID
    type: str
    state: str
    deleted: Optional[datetime] = gql.django.field(
        field_name="markForDestruction"
    )
    link: str

    @gql.django.field()
    def tags(
        self: Content,
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
        self: Content,
        info: Info,
        includeAlgorithms: Optional[List[str]] = None,
    ) -> List[ContentNode]:
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context.request)["Content"]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    @gql.django.field()
    def cluster(self: Content, info: Info) -> ClusterNode:
        if self.limited:
            return None
        # authorization often cannot be used, but it is ok, we have cached then
        res = (
            get_cached_result(info.context.request)["Cluster"]["objects"]
            .filter(id=self.cluster_id)
            .first()
        )
        if not res:
            res = Cluster.objects.get(id=self.cluster_id)
            res.limited = True
        return res

    @gql.django.field(only=["id", "cluster_id"])
    def availableActions(self: Content, info: Info) -> List[ActionEntry]:
        if self.limited:
            return []
        return ActionMixin.availableActions(self, info)

    references: relay.Connection[ContentReferenceNode] = gql.django.connection(
        filters=ContentReferenceFilter
    )
    referencedBy: relay.Connection[
        ContentReferenceNode
    ] = gql.django.connection(filters=ContentReferenceFilter)

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        if root.limited:
            return None
        return root.flexid

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Optional[Info] = None,
        required: bool = False,
    ) -> Optional[ContentNode]:
        result = get_cached_result(info.context.request)["Content"]
        query = fetch_contents(
            result["objects"], result["actions"], id=str(node_id)
        )
        if required:
            return query.get()
        else:
            return query.first()

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Optional[Info] = None,
        node_ids: Optional[Iterable[str]] = None,
    ) -> Iterable[ContentNode]:
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"],
            result["actions"],
            id=node_ids or [],
            limit_ids=100,
        )

    def get_queryset(
        self, queryset, info: Info, filters: ContentFilter
    ) -> QuerySet[ContentNode]:
        result = get_cached_result(info.context.request)["Content"]
        # TODO: perm check for deleted and hidden
        hidden = filters.hidden
        deleted = filters.deleted
        if True:
            hidden = UseCriteria.FALSE

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
                    if filters.public == UseCriteriaPublic.TOKEN
                    else "objects"
                ].values("id")
            )
        )

        return fetch_contents(
            queryset,
            result["actions"],
            states=filters.states,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            minUpdated=filters.minUpdated,
            maxUpdated=filters.maxUpdated,
            contentHashes=filters.contentHashes,
        )


@strawberry.django.filters.filter(Cluster)
class ClusterFilter:
    user: Optional[strawberry.ID] = None
    search: Optional[str] = gql.field(
        default=None, description="Search description and id"
    )
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = gql.field(
        default=None,
        description="Use id=xy for excluding clusters with content ids",
    )
    ids: Optional[List[str]] = None
    excludeIds: Optional[List[str]] = gql.field(
        default=None,
        description="Use for excluding clusters with ids",
    )
    contentHashes: Optional[List[str]] = None
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None

    def filter_user(self, queryset):
        if self.user:
            if not getattr(settings, "AUTH_USER_MODEL", None) and not getattr(
                settings, "SECRETGRAPH_BIND_TO_USER", False
            ):
                # users are not supported in this configuration so ignore them
                user = None
            else:
                try:
                    user = relay.from_base64(self.user)[1]
                except Exception:
                    pass
                queryset = queryset.filter(user__pk=user)
        return queryset

    def filter_search(self, queryset):
        if self.search:
            queryset = queryset.filter(
                Q(flexid_cached__startswith=self.search)
                | Q(name__icontains=self.search)
                | Q(description__icontains=self.search)
            )
        return queryset

    def filter_ids(self, queryset):
        return queryset

    def filter_excludeIds(self, queryset):
        if self.excludeIds is not None:
            queryset = queryset.exclude(flexid_cached__in=self.excludeIds)
        return queryset

    def filter_states(self, queryset):
        return queryset

    def filter_includeTypes(self, queryset):
        return queryset

    def filter_excludeTypes(self, queryset):
        return queryset

    def filter_includeTags(self, queryset):
        return queryset

    def filter_excludeTags(self, queryset):
        return queryset

    def filter_contentHashes(self, queryset):
        return queryset

    def filter_minUpdated(self, queryset):
        return queryset

    def filter_maxUpdated(self, queryset):
        return queryset

    def filter_public(self, queryset):
        if (
            self.public != UseCriteriaPublic.IGNORE
            and self.public != UseCriteriaPublic.TOKEN
        ):
            queryset = queryset.filter(
                public=self.public == UseCriteriaPublic.TRUE
            )
        return queryset

    def filter_deleted(self, queryset):
        if self.deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=self.deleted == UseCriteria.FALSE
            )
        return queryset

    def filter_featured(self, queryset):
        if self.featured != UseCriteria.IGNORE:
            queryset = queryset.filter(
                featured=self.featured == UseCriteria.TRUE
            )
        return queryset


@gql.django.type(Cluster, name="Cluster", filters=ClusterFilter)
class ClusterNode(relay.Node):
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
    def updated(self) -> Optional[datetime]:
        if self.limited:
            return None
        return self.updated

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
    def user(self) -> Optional[strawberry.ID]:
        if self.limited:
            return None
        if not hasattr(self, "user"):
            return None
        #
        return relay.to_base64(get_user_model(), self.user_id)

    @gql.django.field(only=["id", "cluster_id"])
    def availableActions(self, info: Info) -> List[ActionEntry]:
        if self.limited:
            return []
        return ActionMixin.availableActions(self, info)

    @gql.django.field()
    def name(self) -> Optional[str]:
        if self.limited:
            return None
        return self.name

    @gql.django.field()
    def description(self) -> Optional[str]:
        if self.limited:
            return None
        return self.description

    @gql.django.field()
    def groups(self, info: Info) -> Optional[List[str]]:
        if self.limited:
            return None
        # remove hidden
        hidden = GlobalGroup.objects.get_hidden_names()
        return set(self.groups.values_list("name", flat=True)).difference(
            hidden
        )

    # @gql.django.connection(filters=ContentFilterSimple)
    def contents(
        self, info: Info, filters: ContentFilterSimple
    ) -> QuerySet[ContentNode]:
        result = get_cached_result(info.context.request)["Content"]
        contents = result["objects"].filter(hidden=False)
        if self.limited:
            contents = contents.annotate(limited=True)
        return fetch_contents(
            contents.filter(cluster_id=self.id),
            result["actions"],
            states=filters.states,
            includeTypes=["PublicKey"]
            if self.limited
            else filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            contentHashes=filters.contentHashes,
        )

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        if root.limited:
            return None
        return root.flexid

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Optional[Info] = None,
        required: bool = False,
    ) -> Optional[ClusterNode]:
        result = get_cached_result(info.context.request)["Cluster"]
        query = fetch_clusters(
            result["objects"], result["actions"], id=str(node_id)
        )
        if required:
            return query.get()
        else:
            return query.first()

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Optional[Info] = None,
        node_ids: Optional[Iterable[str]] = None,
    ) -> Iterable[ClusterNode]:
        result = get_cached_result(info.context.request)["Cluster"]
        return fetch_clusters(
            result["objects"],
            result["actions"],
            id=node_ids or [],
            limit_ids=100,
        )

    def get_queryset(
        self, queryset, info: Info, filters: ClusterFilter
    ) -> QuerySet[ClusterNode]:

        return fetch_clusters(
            #  required for enforcing permissions
            queryset.filter(
                id__in=Subquery(
                    get_cached_result(info.context.request)["Cluster"][
                        "objects_ignore_public"
                        if filters.public == UseCriteriaPublic.TOKEN
                        else "objects"
                    ].values("id")
                )
            ).distinct(),
            ids=filters.ids,
            limit_ids=None,
            states=filters.states,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            minUpdated=filters.minUpdated,
            maxUpdated=filters.maxUpdated,
            contentHashes=filters.contentHashes,
        )


FlexidType = Union[ClusterNode, ContentNode]
