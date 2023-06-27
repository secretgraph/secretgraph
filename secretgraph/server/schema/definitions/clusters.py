from datetime import datetime
from typing import Iterable, List, Optional
from uuid import UUID

from django.conf import settings
from django.db.models import Q, Subquery, Value
from strawberry import relay
from strawberry.types import Info
from strawberry_django_plus import gql

from ...actions.fetch import fetch_clusters
from ...models import Cluster
from ...utils.auth import (
    fetch_by_id,
    get_cached_net_properties,
    get_cached_result,
)
from ..filters import ClusterFilter, ContentFilterCluster
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import SBaseTypesMixin
from .contents import ContentNode


@gql.django.type(Cluster, name="Cluster")
class ClusterNode(SBaseTypesMixin, relay.Node):
    # overloaded by resolve_id
    flexid: relay.NodeID[str]

    @gql.django.field()
    def featured(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.featured

    @gql.django.field()
    def primary(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.is_primary

    @gql.django.field(description="Is cluster public/global")
    def public(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.globalNameRegisteredAt is None

    @gql.django.field()
    def name(self) -> Optional[str]:
        if self.limited:
            return None
        return self.name

    @gql.django.field()
    def user(self) -> Optional[str]:
        if self.limited:
            return None
        if not self.globalNameRegisteredAt:
            return None
        if not self.user_name:
            return None
        return self.user_name

    @gql.django.field()
    def description(self) -> Optional[str]:
        if self.limited:
            return None
        return self.description

    @gql.django.field()
    def groups(self, info: Info) -> list[str]:
        if self.limited or self.reduced:
            return []
        # permissions allows to see the hidden global groups
        # allow_hidden: have mod rights,
        #   so the groups are handy for communication
        # manage_groups: required for correctly updating groups
        props = get_cached_net_properties(info.context["request"])
        if "allow_hidden" in props or "manage_groups" in props:
            return self.groups.values_list("name", flat=True)
        else:
            return self.groups.filter(hidden=False).values_list(
                "name", flat=True
            )

    @gql.relay.connection(gql.relay.ListConnection[ContentNode])
    def contents(
        self, info: Info, filters: ContentFilterCluster
    ) -> Iterable[ContentNode]:
        if self.reduced:
            return []
        queryset = get_cached_result(info.context["request"])["Content"][
            "objects_with_public"
        ].filter(cluster=self)
        allowDeleted = False
        if not filters.deleted:
            if self.markForDestruction:
                filters.deleted = UseCriteria.IGNORE
                allowDeleted = True
            else:
                filters.deleted = UseCriteria.FALSE
        if self.limited:
            queryset = queryset.annotate(limited=Value(True))
            filters.hidden = UseCriteria.FALSE
            if not allowDeleted:
                filters.deleted = UseCriteria.FALSE
        return ContentNode.get_queryset_intern(
            queryset,
            info,
            filters,
            fixedCluster=True,
            allowDeleted=allowDeleted,
        )

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Optional[Iterable[str]] = None,
        required: bool = False,
    ):
        result = get_cached_result(info.context["request"])["Cluster"]
        if not node_ids:
            return result["objects_with_public"]
        # for allowing specifing global name
        return fetch_by_id(
            result["objects_with_public"],
            node_ids,
            limit_ids=settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS,
            check_short_id=True,
            check_short_name=True,
        )

    @classmethod
    def resolve_id(
        cls,
        root: Cluster,
        *,
        info: Info,
    ) -> str:
        if root.limited:
            return ""
        return root.flexid

    @classmethod
    def get_queryset(cls, queryset, info, **kwargs) -> list[Cluster]:
        result = get_cached_result(info.context["request"])["Cluster"]
        return queryset.filter(
            id__in=Subquery(result["objects_with_public"].values("id"))
        )

    # TODO: merge with get_queryset and update filters
    @classmethod
    def get_queryset_intern(
        cls, queryset, info: Info, filters: Optional[ClusterFilter] = None
    ) -> list[Cluster]:
        result = get_cached_result(info.context["request"])["Cluster"]
        deleted = filters.deleted
        if (
            deleted != UseCriteria.FALSE
            and "manage_deletion"
            not in get_cached_net_properties(info.context["request"])
        ):
            del_result = get_cached_result(
                info.context["request"],
                cacheName="secretgraphDeleteResult",
                scope="delete",
            )["Cluster"]
            queryset = queryset.filter(
                id__in=Subquery(
                    del_result["objects_without_public"].values("id")
                )
            )

        if filters.search:
            queryset = queryset.filter(
                Q(flexid_cached__startswith=filters.search)
                | Q(name__icontains=filters.search)
                | Q(description__icontains=filters.search)
            )

        if filters.excludeIds is not None:
            queryset = queryset.exclude(
                Q(
                    id__in=Subquery(
                        fetch_by_id(
                            Cluster.objects.all(),
                            filters.excludeIds,
                            limit_ids=None,
                            check_short_id=True,
                            check_short_name=True,
                        ).values("id")
                    )
                )
            )

        if (
            filters.public != UseCriteriaPublic.IGNORE
            and filters.public != UseCriteriaPublic.TOKEN
        ):
            queryset = queryset.filter(
                globalNameRegisteredAt__isnull=filters.public
                != UseCriteriaPublic.TRUE
            )
        if deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )

        if filters.primary != UseCriteria.IGNORE:
            queryset = queryset.filter(
                primaryFor__isnull=filters.primary != UseCriteria.TRUE
            )

        if filters.featured != UseCriteria.IGNORE:
            queryset = queryset.filter(
                featured=filters.featured == UseCriteria.TRUE
            )

        return fetch_clusters(
            #  required for enforcing permissions
            queryset.filter(
                id__in=Subquery(
                    result[
                        "objects_without_public"
                        if filters.public == UseCriteriaPublic.TOKEN
                        else "objects_with_public"
                    ].values("id")
                )
            ).distinct(),
            isAdmin="allow_hidden"
            in get_cached_net_properties(info.context["request"]),
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
