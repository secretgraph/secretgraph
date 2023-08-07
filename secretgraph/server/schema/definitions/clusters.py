from typing import Iterable, Optional

import strawberry
import strawberry_django
from django.conf import settings
from django.db.models import Q, Subquery, Value
from strawberry import relay
from strawberry.types import Info

from ...actions.fetch import fetch_clusters
from ...models import Cluster
from ...utils.auth import (
    fetch_by_id_noconvert,
    get_cached_net_properties,
    get_cached_result,
)
from ..filters import ClusterFilter, ContentFilterCluster
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import SBaseTypesMixin
from .contents import ContentNode


@strawberry_django.type(Cluster, name="Cluster")
class ClusterNode(SBaseTypesMixin, relay.Node):
    # we cannot define Node classes without NodeID yet
    flexid: relay.NodeID[str]

    @strawberry_django.field()
    def featured(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.featured

    @strawberry_django.field()
    def primary(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.is_primary

    @strawberry_django.field(description="Is cluster public/global")
    def public(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.globalNameRegisteredAt is None

    @strawberry_django.field()
    def name(self) -> Optional[str]:
        if self.limited:
            return None
        return self.name

    @strawberry_django.field()
    def user(self) -> Optional[str]:
        if self.limited:
            return None
        if not self.globalNameRegisteredAt:
            return None
        if not self.user_name:
            return None
        return self.user_name

    @strawberry_django.field()
    def description(self) -> Optional[str]:
        if self.limited:
            return None
        return self.description

    @strawberry_django.field()
    def groups(self, info: Info) -> list[str]:
        if self.limited or self.reduced:
            return []
        # permissions allows to see the hidden cluster groups
        # allow_hidden: have mod rights,
        #   so the groups are handy for communication
        # manage_groups: required for correctly updating groups
        props = get_cached_net_properties(info.context["request"])
        if "allow_hidden" in props or "manage_groups" in props:
            return list(self.groups.values_list("name", flat=True))
        else:
            return list(
                self.groups.filter(hidden=False).values_list("name", flat=True)
            )

    @strawberry_django.connection(strawberry.relay.ListConnection[ContentNode])
    def contents(
        self,
        info: Info,
        filters: ContentFilterCluster = ContentFilterCluster(),
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
        return ContentNode.do_query(
            queryset,
            info,
            filters=filters,
            fixedCluster=True,
            allowDeleted=allowDeleted,
        )

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Iterable[str],
        required: bool = False,
    ):
        result = get_cached_result(info.context["request"])["Cluster"]
        # for allowing specifing global name and permission check
        return fetch_clusters(
            result["objects_with_public"],
            ids=node_ids,
            limit_ids=settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS,
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
    def do_query(
        cls,
        queryset,
        info,
        filters: ClusterFilter = ClusterFilter(),
        **kwargs,
    ) -> Iterable[Cluster]:
        """
        custom method because get_queryset is not made for this and otherwise is applied twice
        """
        result = get_cached_result(info.context["request"])["Cluster"]
        deleted = False if not filters else filters.deleted
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
        if filters:
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
                            fetch_by_id_noconvert(
                                Cluster.objects.all(),
                                filters.excludeIds,
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

            if filters.primary != UseCriteria.IGNORE:
                queryset = queryset.filter(
                    primaryFor__isnull=filters.primary != UseCriteria.TRUE
                )

            if filters.featured != UseCriteria.IGNORE:
                queryset = queryset.filter(
                    featured=filters.featured == UseCriteria.TRUE
                )
        if deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
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
            ids=filters.includeIds,
            limit_ids=None,
            includeTypes=filters.includeTopics,
            excludeTypes=filters.excludeTopics,
            minUpdated=filters.minUpdated,
            maxUpdated=filters.maxUpdated,
            contentHashes=filters.contentHashes,
        )
