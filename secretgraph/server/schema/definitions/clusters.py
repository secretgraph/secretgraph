from __future__ import annotations

from typing import Optional, List, Iterable
from datetime import datetime
import strawberry
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q, QuerySet
from django.conf import settings
from django.contrib.auth import get_user_model

from ...utils.auth import get_cached_result
from ...actions.view import fetch_clusters, fetch_contents
from ...models import (
    Cluster,
    Content,
    GlobalGroup,
)
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import ActionEntry, ActionMixin


@gql.django.filter(Content)
class ContentFilterSimple:
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = None
    contentHashes: Optional[List[str]] = None
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None
    deleted: UseCriteria = None

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

    def filter_deleted(self, queryset):
        return queryset


@gql.django.filter(Cluster)
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
        return queryset

    def filter_search(self, queryset):
        return queryset

    def filter_ids(self, queryset):
        return queryset

    def filter_excludeIds(self, queryset):
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
        hidden_names = GlobalGroup.objects.get_hidden_names()
        return set(self.groups.values_list("name", flat=True)).difference(
            hidden_names
        )

    @gql.django.connection(filters=ContentFilterSimple)
    def contents(
        self, info: Info, filters: ContentFilterSimple
    ) -> List[strawberry.LazyType["ContentNode", ".contents"]]:
        result = get_cached_result(info.context.request)["Content"]
        contents = result["objects"].filter(hidden=False)
        # TODO check for deleted permission
        deleted = filters.deleted
        if self.limited:
            contents = contents.annotate(limited=True)
            deleted = UseCriteria.FALSE
        if not deleted:
            if self.markForDestruction:
                deleted = UseCriteria.IGNORE
            else:
                deleted = UseCriteria.TRUE

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
        query = fetch_clusters(result["objects"], ids=str(node_id))
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
            ids=node_ids or [],
            limit_ids=100,
        )

    @classmethod
    def get_queryset(cls, queryset, info: Info) -> QuerySet[Cluster]:
        filters = info._field.get_filters()
        if filters.user:
            if not getattr(settings, "AUTH_USER_MODEL", None) and not getattr(
                settings, "SECRETGRAPH_BIND_TO_USER", False
            ):
                # users are not supported in this configuration so ignore them
                user = None
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
            queryset = queryset.exclude(flexid_cached__in=filters.excludeIds)

        if (
            filters.public != UseCriteriaPublic.IGNORE
            and filters.public != UseCriteriaPublic.TOKEN
        ):
            queryset = queryset.filter(
                public=filters.public == UseCriteriaPublic.TRUE
            )
        if filters.deleted != UseCriteria.IGNORE:
            queryset = queryset.filter(
                markForDestruction__isnull=filters.deleted == UseCriteria.FALSE
            )
        return queryset

        if filters.featured != UseCriteria.IGNORE:
            queryset = queryset.filter(
                featured=filters.featured == UseCriteria.TRUE
            )

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
