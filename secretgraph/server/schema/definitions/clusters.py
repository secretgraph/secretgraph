from __future__ import annotations

from typing import TYPE_CHECKING, Iterable, Optional, List
from datetime import datetime
import strawberry
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q, QuerySet, Value
from django.conf import settings
from django.contrib.auth import get_user_model

from ...utils.auth import (
    fetch_by_id,
    get_cached_result,
    get_cached_permissions,
)
from ...actions.view import fetch_clusters, fetch_contents
from ...models import (
    Cluster,
    GlobalGroup,
)
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import ActionEntry, ActionMixin


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
class ClusterNode(relay.Node):
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
    def user(self) -> Optional[strawberry.ID]:
        if self.limited:
            return None
        if not hasattr(self.net, "user_id"):
            return None
        #
        return relay.to_base64(get_user_model(), self.net.user_id)

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
        hidden_names = GlobalGroup.objects.get_hidden_names()
        return set(self.groups.values_list("name", flat=True)).difference(
            hidden_names
        )

    @gql.django.connection()
    def contents(
        self, info: Info, filters: ContentFilterSimple
    ) -> List[
        strawberry.LazyType["ContentNode", ".contents"]  # noqa: F821,F722
    ]:
        result = get_cached_result(info.context.request)["Content"]
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

        return fetch_contents(
            queryset.filter(id__in=Subquery(result["objects"].values("id"))),
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
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Info,
        required: bool = False,
    ):
        result = get_cached_result(info.context)["Cluster"]
        if node_id.startswith("@"):
            q = Q(name=node_id, globalNameRegisteredAt__isnull=False)
        else:
            q = Q(flexid=node_id)
        try:
            result["Cluster"]["objects"].get(q)
        except (Cluster.DoesNotExist, ValueError) as exc:
            if required:
                raise exc
            return None

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Optional[Iterable[str]] = None,
    ):
        result = get_cached_result(info.context)["Cluster"]
        if not node_ids:
            return result["Cluster"]["objects"]
        # for allowing specifing global name
        return fetch_by_id(
            result["Cluster"]["objects"], node_ids, limit_ids=None
        )

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        if root.limited:
            return ""
        return root.flexid

    @classmethod
    def get_queryset(cls, queryset, info) -> QuerySet[Cluster]:
        result = get_cached_result(info.context.request)["Cluster"]
        return queryset.filter(id__in=Subquery(result["objects"].values("id")))

    # TODO: merge with get_queryset and update filters
    @classmethod
    def get_queryset_intern(
        cls, queryset, info: Info, filters: Optional[ClusterFilter] = None
    ) -> QuerySet[Cluster]:
        result = get_cached_result(info.context.request)["Cluster"]
        deleted = filters.deleted
        if (
            deleted != UseCriteria.FALSE
            and not get_cached_permissions(info.context.request)[
                "manage_deletion"
            ]
        ):
            del_result = get_cached_result(
                info.context.request, scope="delete"
            )["Cluster"]
            queryset = queryset.filter(
                id__in=Subquery(del_result["objects"].values("id"))
            )
        if filters.user:
            # users are not supported in this configuration so ignore them
            user = None
            if not getattr(settings, "AUTH_USER_MODEL", None) and not getattr(
                settings, "SECRETGRAPH_BIND_TO_USER", False
            ):
                pass
            else:
                try:
                    user = relay.from_base64(filters.user)[1]
                except Exception:
                    pass
                queryset = queryset.filter(user__pk=user)

        if filters.search:
            queryset = queryset.filter(
                Q(flexid_cached__startswith=filters.search)
                | Q(name__icontains=filters.search)
                | Q(description__icontains=filters.search)
            )

        if filters.excludeIds is not None:
            queryset = Q(
                id__in=Subquery(
                    fetch_by_id(
                        Cluster.objects.all(),
                        filters.excludeIds,
                        limit_ids=None,
                    ).values("id")
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
