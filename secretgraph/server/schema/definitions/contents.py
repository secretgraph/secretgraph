from __future__ import annotations

from typing import TYPE_CHECKING, Optional, List
from datetime import datetime
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q

from ....core import constants
from ...utils.auth import (
    get_cached_result,
    get_cached_permissions,
    fetch_by_id,
)
from ...actions.view import fetch_contents, ContentFetchQueryset
from ...models import (
    Content,
    Cluster,
    ContentReference,
)
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import ActionEntry, ActionMixin
from .references import ContentReferenceNode, ContentReferenceFilter

if TYPE_CHECKING:
    from .clusters import ClusterNode


@gql.input
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
    clusters: Optional[List[gql.ID]] = None
    hidden: UseCriteria = UseCriteria.FALSE
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None


@gql.django.type(Content, name="Content")
class ContentNode(relay.Node):
    id_attr = "flexid"

    nonce: str
    updated: datetime
    contentHash: Optional[str]
    updateId: UUID
    type: str
    state: str
    deleted: Optional[datetime] = gql.django.field(
        field_name="markForDestruction"
    )
    link: str
    limited: gql.Private[bool] = False

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
    ) -> List["ContentNode"]:
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context.request)["Content"]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    @gql.django.field()
    def cluster(
        self: Content, info: Info
    ) -> Optional[gql.LazyType["ClusterNode", ".clusters"]]:
        if self.limited:
            return None
        # authorization often cannot be used, but it is ok, we have cached then
        res = (
            get_cached_result(info.context.request)["Cluster"]["objects"]
            .filter(id=self.cluster_id)
            .first()
        )
        if not res:
            self.cluster.limited = True
        return self.cluster

    @gql.django.field(only=["id", "cluster_id"])
    def availableActions(self: Content, info: Info) -> List[ActionEntry]:
        if self.limited:
            return []
        return ActionMixin.availableActions(self, info)

    @gql.django.connection()
    def references(
        self, info: Info, filters: ContentReferenceFilter
    ) -> List[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.cluster_id == 1
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context.request)["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}

        if filters.groups is not None:
            filterob["group__in"] = filters.groups

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
        return self.references.filter(
            **filterob,
        )

    @gql.django.connection()
    def referencedBy(
        self, info: Info, filters: ContentReferenceFilter
    ) -> List[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.cluster_id == 1
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context.request)["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}
        if filters.groups is not None:
            filterob["group__in"] = filters.groups

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
        return self.referencedBy.filter(
            **filterob,
        )

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        if root.limited:
            return ""
        return root.flexid

    @classmethod
    def get_queryset(cls, queryset, info) -> ContentFetchQueryset:
        result = get_cached_result(info.context.request)["Content"]
        return ContentFetchQueryset(
            queryset.filter(
                id__in=Subquery(result["objects"].values("id"))
            ).query,
            actions=result["actions"],
        )

    # TODO: merge with get_queryset and update filters
    @classmethod
    def get_queryset_intern(
        cls, queryset, info: Info, filters: ContentFilter
    ) -> ContentFetchQueryset:
        result = get_cached_result(
            info.context.request,
        )["Content"]
        deleted = filters.deleted
        if (
            deleted != UseCriteria.FALSE
            and not get_cached_permissions(info.context.request)[
                "manage_deletion"
            ]
        ):
            del_result = get_cached_result(
                info.context.request, scope="delete"
            )["Content"]
            queryset = queryset.filter(
                id__in=Subquery(del_result["objects"].values("id"))
            )

        if get_cached_permissions(
            info.context.request,
        )["manage_hidden"]:
            hidden = filters.hidden
        else:
            hidden = UseCriteria.FALSE
        if filters.clusters is not None:
            queryset = queryset.filter(
                cluster_id__in=Subquery(
                    fetch_by_id(
                        Cluster.objects.all(), filters.clusters, limit_ids=None
                    ).values("id")
                )
            )

        if filters.public == UseCriteriaPublic.TOKEN:
            pass
        elif filters.public != UseCriteriaPublic.IGNORE:
            # should only include public contents with public cluster
            # if no clusters are specified (e.g. root query)
            if filters.public == UseCriteriaPublic.TRUE:
                if not filters.clusters:
                    queryset = queryset.filter(
                        state__in=constants.public_states,
                        cluster__globalNameRegisteredAt__isnull=False,
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
                ~Q(state__in=constants.public_states)
                | Q(cluster__globalNameRegisteredAt__isnull=False)
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
