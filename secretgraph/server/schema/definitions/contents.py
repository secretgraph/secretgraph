from __future__ import annotations

from typing import TYPE_CHECKING, Optional
from datetime import datetime
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q, QuerySet

from ....core.constants import public_states
from ...utils.auth import (
    get_cached_result,
    get_cached_properties,
    fetch_by_id,
)
from ...actions.fetch import fetch_contents
from ...models import (
    Content,
    Action,
    ContentReference,
)
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import ActionMixin
from .references import ContentReferenceNode, ContentReferenceFilter

if TYPE_CHECKING:
    from .clusters import ClusterNode


@gql.input
class ContentFilter:
    states: Optional[list[str]] = None
    includeTypes: Optional[list[str]] = None
    excludeTypes: Optional[list[str]] = None
    includeTags: Optional[list[str]] = None
    excludeTags: Optional[list[str]] = gql.django.field(
        default=None,
        description="Use id=xy for excluding contents with ids",
    )
    contentHashes: Optional[list[str]] = None
    clusters: Optional[list[gql.ID]] = None
    hidden: UseCriteria = UseCriteria.FALSE
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None


# for actions view and fetch
@gql.type
class ReadStatistic:
    query: gql.Private[QuerySet[Action]]

    @gql.field()
    def last(self) -> Optional[datetime]:
        action = (
            self.query.filter(used__isnull=False).only("used").latest("used")
        )
        if action:
            return action.used
        return None

    @gql.field()
    def first(self) -> Optional[datetime]:
        action = (
            self.query.filter(used__isnull=False).only("used").earliest("used")
        )
        if action:
            return action.used
        return None

    @gql.field()
    def count(self) -> int:
        return self.query.filter(used__isnull=False).count()

    @gql.field()
    def totalAmount(self) -> int:
        return self.query.count()


@gql.django.type(Content, name="Content")
class ContentNode(ActionMixin, relay.Node):
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
    def readStatistic(self: Content) -> ReadStatistic:
        """Uses fetch/view group actions to provide statistics"""
        return ReadStatistic(
            query=Action.objects.filter(
                contentAction_id__in=Subquery(
                    self.actions.filter(group__in=("fetch", "view")).values(
                        "id"
                    )
                )
            )
        )

    @gql.django.field()
    def tags(
        self: Content,
        info: Info,
        includeTags: Optional[list[str]] = None,
        excludeTags: Optional[list[str]] = None,
    ) -> list[str]:
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
        includeAlgorithms: Optional[list[str]] = None,
    ) -> list[str]:
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context["request"])["Content"]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    @gql.django.field()
    def cluster(
        self: Content, info: Info
    ) -> Optional[gql.LazyType["ClusterNode", ".clusters"]]:
        # we are in the 2nd level, block
        if self.limited:
            return None
        results = get_cached_result(
            info.context["request"], ensureInitialized=True
        )
        if self.state not in public_states:
            query = results["Cluster"]["objects_ignore_public"]
        else:
            query = results["Cluster"]["objects"]
        cluster_visible = query.filter(id=self.cluster_id).exists()
        if not cluster_visible:
            # set cluster to limited (first level)
            self.cluster.limited = True
        return self.cluster

    @gql.django.connection()
    def references(
        self, info: Info, filters: ContentReferenceFilter
    ) -> list[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            # TODO: maybe relax later
            or self.cluster_id == 0
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context["request"])["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}

        if filters.groups is not None:
            filterob["group__in"] = filters.groups

        filterob["target__in"] = fetch_contents(
            query,
            clustersAreRestricted=True,
            states=filters.states,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            contentHashes=filters.contentHashes,
        )
        return self.references.filter(
            **filterob,
        )

    @gql.django.connection()
    def referencedBy(
        self, info: Info, filters: ContentReferenceFilter
    ) -> list[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            # TODO: maybe relax later
            or self.cluster_id == 0
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context["request"])["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}
        if filters.groups is not None:
            filterob["group__in"] = filters.groups

        filterob["source__in"] = fetch_contents(
            query,
            clustersAreRestricted=True,
            states=filters.states,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            contentHashes=filters.contentHashes,
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
    def get_queryset(cls, queryset, info) -> list[Content]:
        results = get_cached_result(info.context["request"])

        return queryset.filter(
            id__in=Subquery(results["Content"]["objects"].values("id"))
        )

    # TODO: merge with get_queryset and update filters
    @classmethod
    def get_queryset_intern(
        cls, queryset, info: Info, filters: ContentFilter
    ) -> list[Content]:
        results = get_cached_result(
            info.context["request"],
        )
        deleted = filters.deleted
        if (
            deleted != UseCriteria.FALSE
            and "manage_deletion"
            not in get_cached_properties(info.context["request"])
        ):
            del_result = get_cached_result(
                info.context["request"], scope="delete"
            )["Content"]
            queryset = queryset.filter(
                id__in=Subquery(del_result["objects"].values("id"))
            )

        if "manage_hidden" in get_cached_properties(
            info.context["request"],
        ):
            hidden = filters.hidden
        else:
            hidden = UseCriteria.FALSE
        if hidden != UseCriteria.IGNORE:
            queryset = queryset.filter(hidden=hidden == UseCriteria.TRUE)
        if filters.featured != UseCriteria.IGNORE:
            queryset = queryset.filter(
                cluster__featured=filters.featured == UseCriteria.TRUE
            )
        if filters.clusters is not None:
            queryset = queryset.filter(
                cluster_id__in=Subquery(
                    fetch_by_id(
                        results["Cluster"]["objects"],
                        filters.clusters,
                        limit_ids=None,
                        check_short_id=True,
                        check_short_name=True,
                    ).values("id")
                ),
            )
        if filters.public == UseCriteriaPublic.TRUE:
            filters.states = list(
                public_states.intersection(filters.states or public_states)
            )
        elif filters.public == UseCriteriaPublic.FALSE:
            # safest way and future proof
            if filters.states:
                filters.states = list(
                    set(filters.states).difference(public_states)
                )
            else:
                # no states, so we can just exclude public states
                queryset = queryset.exclude(state__in=public_states)

        if deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )

        queryset = queryset.filter(
            id__in=Subquery(
                results["Content"][
                    "objects_ignore_public"
                    if filters.public == UseCriteriaPublic.TOKEN
                    else "objects"
                ].values("id")
            )
        )

        return fetch_contents(
            queryset,
            states=filters.states,
            clustersAreRestricted=filters.clusters is not None,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            minUpdated=filters.minUpdated,
            maxUpdated=filters.maxUpdated,
            contentHashes=filters.contentHashes,
        )
