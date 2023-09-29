from datetime import datetime
from typing import TYPE_CHECKING, Annotated, Iterable, Optional

import strawberry
import strawberry_django
from django.conf import settings
from django.db.models import Q, QuerySet, Subquery
from strawberry.types import Info

from ....core.constants import public_states
from ...actions.fetch import fetch_contents
from ...models import Action, Content, ContentReference
from ...utils.auth import (
    fetch_by_id_noconvert,
    get_cached_net_properties,
    get_cached_result,
)
from ..filters import ContentFilter, ContentReferenceFilter
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import SBaseTypesMixin
from .references import ContentReferenceNode

if TYPE_CHECKING:
    from .clusters import ClusterNode


# for actions view and fetch
@strawberry.type
class ReadStatistic:
    query: strawberry.Private[QuerySet[Action]]

    @strawberry.field()
    async def last(self) -> Optional[datetime]:
        try:
            action = await (
                self.query.filter(used__isnull=False)
                .only("used")
                .alatest("used")
            )
        except Action.DoesNotExist:
            return None
        assert action
        return action.used

    @strawberry.field()
    async def first(self) -> Optional[datetime]:
        try:
            action = await (
                self.query.filter(used__isnull=False)
                .only("used")
                .aearliest("used")
            )
        except Action.DoesNotExist:
            return None
        assert action
        return action.used

    @strawberry.field()
    async def count(self) -> int:
        return await self.query.filter(used__isnull=False).acount()

    @strawberry.field()
    async def totalAmount(self) -> int:
        return await self.query.acount()


@strawberry_django.type(Content, name="Content")
class ContentNode(SBaseTypesMixin, strawberry.relay.Node):
    # we cannot define Node classes without NodeID yet
    flexid: strawberry.relay.NodeID[str]

    nonce: str
    type: str
    state: str
    link: str

    @strawberry_django.field()
    def readStatistic(self: Content) -> Optional[ReadStatistic]:
        if self.limited or self.reduced:
            return None
        query = Action.objects.filter(
            contentAction__in=self.actions.filter(group__in=("fetch", "view"))
        )
        """Uses fetch/view group actions to provide statistics"""
        return ReadStatistic(query=query)

    @strawberry_django.field()
    def contentHash(self) -> Optional[str]:
        if self.limited:
            return None
        return self.contentHash

    @strawberry_django.field()
    def tags(
        self: Content,
        info: Info,
        includeTags: Optional[list[str]] = None,
        excludeTags: Optional[list[str]] = None,
    ) -> list[str]:
        if self.reduced:
            return []
        incl_filters = Q()
        excl_filters = Q()
        for i in includeTags or []:
            incl_filters |= Q(tag__startswith=i)

        for i in excludeTags or []:
            excl_filters |= Q(tag__startswith=i)
        tags = self.tags.filter(~excl_filters & incl_filters)
        if self.limited:
            tags.filter(
                Q(tag__startswith="key_hash=") | Q(tag__startswith="name=")
            )
        return list(tags.values_list("tag", flat=True))

    @strawberry_django.field()
    def cluster(
        self: Content, info: Info
    ) -> Optional[Annotated["ClusterNode", strawberry.lazy(".clusters")]]:
        # we are in the 2nd level, block
        if self.limited or self.reduced:
            return None
        results = get_cached_result(
            info.context["request"], ensureInitialized=True
        )
        if self.state not in public_states:
            query = results["Cluster"]["objects_without_public"]
        else:
            # e.g. blocked by action
            query = results["Cluster"]["objects_with_public"]
        cluster_is_visible = query.filter(id=self.cluster_id).exists()
        if not cluster_is_visible:
            # set cluster to limited (first level)
            self.cluster.limited = True
        return self.cluster

    @strawberry_django.connection(
        strawberry.relay.ListConnection[ContentReferenceNode]
    )
    def references(
        self, info: Info, filters: ContentReferenceFilter
    ) -> Iterable[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.reduced
            # TODO: maybe relax later
            or self.cluster_id == 0
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context["request"])["Content"]
        query = result["objects_with_public"].exclude(hidden=True)
        filterob = {}

        if filters.groups is not None:
            filterob["group__in"] = filters.groups

        filterob["target__in"] = fetch_contents(
            query,
            clustersAreRestrictedOrAdmin=True,
            states=filters.states,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            contentHashes=filters.contentHashes,
        ).filter(locked__isnull=True)
        return self.references.filter(
            **filterob,
        )

    @strawberry_django.connection(
        strawberry.relay.ListConnection[ContentReferenceNode]
    )
    def referencedBy(
        self, info: Info, filters: ContentReferenceFilter
    ) -> Iterable[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.reduced
            # TODO: maybe relax later
            or self.cluster_id == 0
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context["request"])["Content"]
        query = result["objects_with_public"].exclude(hidden=True)
        filterob = {}
        if filters.groups is not None:
            filterob["group__in"] = filters.groups

        filterob["source__in"] = fetch_contents(
            query,
            clustersAreRestrictedOrAdmin=True,
            states=filters.states,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            contentHashes=filters.contentHashes,
        ).filter(locked__isnull=True)
        return self.referencedBy.filter(
            **filterob,
        )

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Iterable[str],
        required: bool = False,
    ):
        result = get_cached_result(info.context["request"])["Content"]
        # for permission check
        return fetch_contents(
            result["objects_with_public"],
            ids=node_ids,
            limit_ids=settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS,
        ).filter(locked__isnull=True)

    @classmethod
    def resolve_id(
        cls,
        root: Content,
        *,
        info: Info,
    ) -> str:
        if root.limited:
            return ""
        return root.flexid

    @classmethod
    def do_query(
        cls,
        queryset,
        info: Info,
        filters: ContentFilter = ContentFilter(),
        fixedCluster: strawberry.Private[bool] = False,
        allowDeleted: strawberry.Private[bool] = False,
        **kwargs,
    ) -> Iterable[Content]:
        """
        custom method because get_queryset is not made for this and otherwise is applied twice
        """
        results = get_cached_result(info.context["request"])

        if (
            filters.hidden != UseCriteria.FALSE
            and "allow_hidden"
            in get_cached_net_properties(
                info.context["request"],
            )
        ):
            hidden = filters.hidden
        else:
            hidden = UseCriteria.FALSE
        if hidden != UseCriteria.IGNORE:
            queryset = queryset.filter(hidden=hidden == UseCriteria.TRUE)
        assert fixedCluster or hasattr(
            filters, "featured"
        ), "wrong type for fixed cluster: %s" % type(filters)
        if not fixedCluster and filters.featured != UseCriteria.IGNORE:
            queryset = queryset.filter(
                cluster__featured=filters.featured == UseCriteria.TRUE
            )
        if not fixedCluster and filters.clusters is not None:
            queryset = queryset.filter(
                cluster_id__in=Subquery(
                    fetch_by_id_noconvert(
                        results["Cluster"]["objects_with_public"],
                        filters.clusters,
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
        if (
            filters.deleted != UseCriteria.FALSE
            and not allowDeleted
            and "manage_deletion"
            not in get_cached_net_properties(info.context["request"])
        ):
            del_result = get_cached_result(
                info.context["request"],
                scope="delete",
                cacheName="secretgraphDeleteResult",
            )["Content"]
            queryset = queryset.filter(
                id__in=Subquery(
                    del_result["objects_without_public"].values("id")
                )
            )

        if filters.deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=filters.deleted == UseCriteria.FALSE
            )

        queryset = queryset.filter(
            id__in=Subquery(
                results["Content"][
                    "objects_without_public"
                    if filters.public == UseCriteriaPublic.TOKEN
                    else "objects_with_public"
                ].values("id")
            )
        )

        return fetch_contents(
            queryset,
            states=filters.states,
            clustersAreRestrictedOrAdmin=fixedCluster
            or "allow_hidden"
            in get_cached_net_properties(
                info.context["request"],
            )
            or filters.clusters is not None,
            includeTypes=filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            minUpdated=filters.minUpdated,
            maxUpdated=filters.maxUpdated,
            contentHashes=filters.contentHashes,
        ).filter(locked__isnull=True)
