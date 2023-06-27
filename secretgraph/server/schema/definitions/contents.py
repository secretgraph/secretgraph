from datetime import datetime
from typing import TYPE_CHECKING, Annotated, Iterable, Optional
from uuid import UUID

from django.db.models import Q, QuerySet, Subquery
from strawberry import relay
from strawberry.types import Info
from strawberry_django_plus import gql

from ....core.constants import public_states
from ...actions.fetch import fetch_contents
from ...models import Action, Content, ContentReference
from ...utils.auth import (
    fetch_by_id,
    get_cached_net_properties,
    get_cached_result,
)
from ..filters import ContentFilter
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import ActionBaseNamespace, ActionEntry
from .references import ContentReferenceFilter, ContentReferenceNode

if TYPE_CHECKING:
    from .clusters import ClusterNode


# for actions view and fetch
@gql.type
class ReadStatistic:
    query: gql.Private[QuerySet[Action]]

    @gql.field()
    async def last(self) -> Optional[datetime]:
        action = await (
            self.query.filter(used__isnull=False).only("used").alatest("used")
        )
        if action:
            return action.used
        return None

    @gql.field()
    async def first(self) -> Optional[datetime]:
        action = await (
            self.query.filter(used__isnull=False)
            .only("used")
            .aearliest("used")
        )
        if action:
            return action.used
        return None

    @gql.field()
    async def count(self) -> int:
        return await self.query.filter(used__isnull=False).acount()

    @gql.field()
    async def totalAmount(self) -> int:
        return await self.query.acount()


@gql.django.type(Content, name="Content")
class ContentNode(relay.Node):
    flexid: relay.NodeID[str]

    nonce: str
    type: str
    state: str

    deleted: Optional[datetime] = gql.django.field(
        field_name="markForDestruction"
    )
    link: str
    limited: gql.Private[bool] = False
    reduced: gql.Private[bool] = False

    @gql.field()
    @gql.django.django_resolver
    async def availableActions(self, info: Info) -> list[ActionEntry]:
        if self.limited or self.reduced:
            return
        async for i in ActionBaseNamespace.availableActions(self, info):
            yield i

    @gql.field()
    @gql.django.django_resolver
    def authOk(self, info: Info) -> bool:
        if self.limited or self.reduced:
            return False
        return ActionBaseNamespace.authOk(self, info)

    @gql.field()
    def readStatistic(self: Content) -> Optional[ReadStatistic]:
        if self.limited or self.reduced:
            return None
        query = Action.objects.filter(
            contentAction_id__in=Subquery(
                self.actions.filter(group__in=("fetch", "view")).values("id")
            )
        )
        """Uses fetch/view group actions to provide statistics"""
        return ReadStatistic(query=query)

    @gql.field()
    def updated(self) -> Optional[datetime]:
        if self.limited:
            return None
        return self.updated

    @gql.field()
    def contentHash(self) -> Optional[str]:
        if self.limited:
            return None
        return self.contentHash

    @gql.field()
    def updateId(self) -> Optional[UUID]:
        if self.limited:
            return None
        return self.updateId

    @gql.field()
    @gql.django.django_resolver
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
        if self.reduced:
            return []
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context["request"])["Content"]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(
                target__in=result["objects_with_public"]
            ),
        )

    @gql.django.field()
    def properties(self, info: Info) -> list[str]:
        if self.limited or self.reduced:
            return []
        if "allow_hidden" in get_cached_net_properties(
            info.context["request"]
        ):
            return self.properties
        else:
            return self.nonhidden_properties

    @gql.field()
    @gql.django.django_resolver
    def cluster(
        self: Content, info: Info
    ) -> Optional[Annotated["ClusterNode", gql.lazy(".clusters")]]:
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

    @gql.relay.connection(gql.relay.ListConnection[ContentReferenceNode])
    @gql.django.django_resolver
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
        )
        return self.references.filter(
            **filterob,
        )

    @gql.relay.connection(gql.relay.ListConnection[ContentReferenceNode])
    @gql.django.django_resolver
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
        )
        return self.referencedBy.filter(
            **filterob,
        )

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
    def get_queryset(cls, queryset, info, **kwargs) -> list[Content]:
        results = get_cached_result(info.context["request"])

        return queryset.filter(
            id__in=Subquery(
                results["Content"]["objects_with_public"].values("id")
            )
        )

    # TODO: merge with get_queryset and update filters
    @classmethod
    def get_queryset_intern(
        cls,
        queryset,
        info: Info,
        filters: ContentFilter,
        fixedCluster: gql.Private[bool] = False,
        allowDeleted: gql.Private[bool] = False,
    ) -> list[Content]:
        results = get_cached_result(
            info.context["request"],
        )

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
        if not fixedCluster and filters.featured != UseCriteria.IGNORE:
            queryset = queryset.filter(
                cluster__featured=filters.featured == UseCriteria.TRUE
            )
        if not fixedCluster and filters.clusters is not None:
            queryset = queryset.filter(
                cluster_id__in=Subquery(
                    fetch_by_id(
                        results["Cluster"]["objects_with_public"],
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
        )
