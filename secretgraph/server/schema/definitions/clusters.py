from typing import Iterable, Optional, List
from datetime import datetime
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q, Value

from ...utils.auth import (
    fetch_by_id,
    get_cached_result,
    get_cached_net_properties,
)
from ...actions.fetch import fetch_clusters
from ...models import (
    Cluster,
)
from ..shared import UseCriteria, UseCriteriaPublic
from ..filters import ClusterFilter, ContentFilterCluster
from ._shared import ActionMixin

from .contents import ContentNode


@gql.django.type(Cluster, name="Cluster")
class ClusterNode(ActionMixin, relay.Node):
    id_attr = "flexid"
    limited: gql.Private[bool] = False

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
    def properties(self, info: Info) -> Optional[List[str]]:
        if self.limited:
            return None
        if "allow_hidden" in get_cached_net_properties(
            info.context["request"]
        ):
            return self.properties
        else:
            return self.nonhidden_properties

    @gql.django.field()
    def groups(self, info: Info) -> Optional[List[str]]:
        if self.limited:
            return None
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

    @gql.django.connection()
    def contents(
        self, info: Info, filters: ContentFilterCluster
    ) -> list[ContentNode]:
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

    @gql.django.django_resolver
    @staticmethod
    def _resolve_node(
        node_id: str,
        *,
        info: Info,
        required: bool = False,
    ):
        result = get_cached_result(info.context["request"])["Cluster"]
        if node_id.startswith("@"):
            q = Q(name=node_id, globalNameRegisteredAt__isnull=False)
        else:
            q = Q(flexid=node_id)
        try:
            return result["_iw"].get(q)
        except (Cluster.DoesNotExist, ValueError) as exc:
            if required:
                raise exc
            return None

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Info,
        required: bool = False,
    ):
        return cls._resolve_node(node_id, info=info, required=required)

    @gql.django.django_resolver
    @staticmethod
    def _resolve_nodes(
        *,
        info: Info,
        node_ids: Optional[Iterable[str]] = None,
    ):
        result = get_cached_result(info.context["request"])["Cluster"]
        if not node_ids:
            return result["objects_with_public"]
        # for allowing specifing global name
        return fetch_by_id(
            result["objects_with_public"],
            node_ids,
            limit_ids=None,
            check_short_id=True,
            check_short_name=True,
        )

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Optional[Iterable[str]] = None,
    ):
        return cls._resolve_nodes(info=info, node_ids=node_ids)

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
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
