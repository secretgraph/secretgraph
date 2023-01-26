from __future__ import annotations

from typing import TYPE_CHECKING, Iterable, Optional, List
from datetime import datetime
import strawberry
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q, QuerySet, Value

from ...utils.auth import (
    fetch_by_id,
    get_cached_result,
    get_cached_properties,
)
from ...actions.fetch import fetch_clusters, fetch_contents
from ...models import (
    Cluster,
    GlobalGroup,
)
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import ActionMixin


if TYPE_CHECKING:
    from .contents import ContentNode


@gql.input
class ContentFilterSimple:
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = None
    contentHashes: Optional[List[str]] = None
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None
    deleted: Optional[UseCriteria] = None


@gql.input
class ClusterFilter:
    search: Optional[str] = gql.field(
        default=None, description="Search description, id and name"
    )
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = gql.field(
        default=None,
        description="Use id=xy for excluding clusters with content ids",
    )
    ids: Optional[List[gql.ID]] = gql.field(
        default=None,
        description="Filter clusters with ids or global name",
    )
    excludeIds: Optional[List[gql.ID]] = gql.field(
        default=None,
        description="Use for excluding clusters with ids or global names",
    )
    contentHashes: Optional[List[str]] = None
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None


@gql.django.type(Cluster, name="Cluster")
class ClusterNode(ActionMixin, relay.Node):
    id_attr = "flexid"
    limited: gql.Private[bool] = False

    @gql.django.field()
    def featured(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.featured

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
        return str(self.net.user)

    @gql.django.field()
    def description(self) -> Optional[str]:
        if self.limited:
            return None
        return self.description

    @gql.django.field()
    def groups(self, info: Info) -> Optional[List[str]]:
        if self.limited:
            return None
        names = self.groups.values_list("name", flat=True)
        # permissions allows to see the hidden global groups
        # manage_hidden: have mod rights,
        #   so the groups are handy for communication
        # manage_groups: required for correctly updating groups
        props = get_cached_properties(info.context["request"])
        if "manage_hidden" in props or "manage_groups" in props:
            return names
        # remove hidden
        hidden_names = GlobalGroup.objects.get_hidden_names()
        return set(names).difference(hidden_names)

    @gql.django.connection()
    def contents(
        self, info: Info, filters: ContentFilterSimple
    ) -> relay.Connection[
        strawberry.LazyType["ContentNode", ".contents"]  # noqa: F821,F722
    ]:
        result = get_cached_result(info.context["request"])["Content"]
        queryset: QuerySet = self.contents.filter(hidden=False)
        deleted = filters.deleted
        if self.limited:
            queryset = queryset.annotate(limited=Value(True))
            deleted = UseCriteria.FALSE
        if not deleted:
            if self.markForDestruction:
                deleted = UseCriteria.IGNORE
            else:
                deleted = UseCriteria.TRUE

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

        return fetch_contents(
            queryset.filter(id__in=Subquery(result["objects"].values("id"))),
            clustersAreRestricted=True,
            states=filters.states,
            includeTypes=["PublicKey"]
            if self.limited
            else filters.includeTypes,
            excludeTypes=filters.excludeTypes,
            includeTags=filters.includeTags,
            excludeTags=filters.excludeTags,
            contentHashes=filters.contentHashes,
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
            return result["objects"].get(q)
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
            return result["objects"]
        # for allowing specifing global name
        return fetch_by_id(
            result["objects"],
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
    def get_queryset(cls, queryset, info) -> Iterable[Cluster]:
        result = get_cached_result(info.context["request"])["Cluster"]
        return queryset.filter(id__in=Subquery(result["objects"].values("id")))

    # TODO: merge with get_queryset and update filters
    @classmethod
    def get_queryset_intern(
        cls, queryset, info: Info, filters: Optional[ClusterFilter] = None
    ) -> Iterable[Cluster]:
        result = get_cached_result(info.context["request"])["Cluster"]
        deleted = filters.deleted
        if (
            deleted != UseCriteria.FALSE
            and "manage_deletion"
            not in get_cached_properties(info.context["request"])
        ):
            del_result = get_cached_result(
                info.context["request"], scope="delete"
            )["Cluster"]
            queryset = queryset.filter(
                id__in=Subquery(del_result["objects"].values("id"))
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

        if filters.featured != UseCriteria.IGNORE:
            queryset = queryset.filter(
                featured=filters.featured == UseCriteria.TRUE
            )

        return fetch_clusters(
            #  required for enforcing permissions
            queryset.filter(
                id__in=Subquery(
                    result[
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
