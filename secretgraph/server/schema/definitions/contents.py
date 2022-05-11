from __future__ import annotations

from typing import Optional, List, Iterable
from datetime import datetime
import strawberry
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q, QuerySet

from .... import constants
from ...utils.auth import get_cached_result, fetch_by_id
from ...actions.view import fetch_contents
from ...models import (
    Cluster,
    Content,
    ContentReference,
)
from ..shared import UseCriteria, UseCriteriaPublic
from ._shared import ActionEntry, ActionMixin
from .references import ContentReferenceNode, ContentReferenceFilter


@gql.django.filter(Content)
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
    clusters: Optional[List[strawberry.ID]] = None
    hidden: UseCriteria = UseCriteria.FALSE
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None

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

    def filter_hidden(self, queryset):
        return queryset

    def filter_deleted(self, queryset):
        return queryset

    def filter_clusters(self, queryset):
        return queryset

    def filter_public(self, queryset):
        return queryset

    def filter_minUpdated(self, queryset):
        return queryset

    def filter_maxUpdated(self, queryset):
        return queryset


@gql.django.type(Content, name="Content", filters=ContentFilter)
class ContentNode(relay.Node):
    nonce: str
    updated: datetime
    contentHash: str
    updateId: UUID
    type: str
    state: str
    deleted: Optional[datetime] = gql.django.field(
        field_name="markForDestruction"
    )
    link: str

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
    ) -> List[strawberry.LazyType["ContentNode", "."]]:
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context.request)["Content"]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    @gql.django.field()
    def cluster(
        self: Content, info: Info
    ) -> strawberry.LazyType["ClusterNode", ".clusters"]:
        if self.limited:
            return None
        # authorization often cannot be used, but it is ok, we have cached then
        res = (
            get_cached_result(info.context.request)["Cluster"]["objects"]
            .filter(id=self.cluster_id)
            .first()
        )
        if not res:
            res = Cluster.objects.get(id=self.cluster_id)
            res.limited = True
        return res

    @gql.django.field(only=["id", "cluster_id"])
    def availableActions(self: Content, info: Info) -> List[ActionEntry]:
        if self.limited:
            return []
        return ActionMixin.availableActions(self, info)

    @gql.django.connection(filters=ContentReferenceFilter)
    def references(self, info: Info) -> List[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.cluster_id == 1
        ):
            return ContentReference.objects.none()
        filters = info._field.get_filters()
        result = get_cached_result(info.context.request)["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}

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

    @gql.django.connection(filters=ContentReferenceFilter)
    def referencedBy(self, info: Info) -> List[ContentReferenceNode]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.cluster_id == 1
        ):
            return ContentReference.objects.none()
        filters = info._field.get_filters()
        result = get_cached_result(info.context.request)["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}

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
            return None
        return root.flexid

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Optional[Info] = None,
        required: bool = False,
    ) -> Optional[ContentNode]:
        result = get_cached_result(info.context.request)["Content"]
        query = fetch_contents(
            result["objects"], result["actions"], ids=str(node_id)
        )
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
    ) -> List[ContentNode]:
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"],
            result["actions"],
            ids=node_ids or [],
            limit_ids=100,
        )

    @classmethod
    def get_queryset(cls, queryset, info: Info) -> QuerySet[Content]:
        # if (
        #     info.python_name == "references"
        #     or info.python_name == "referencedBy"
        # ):
        #     return ContentReferenceNode.get_queryset(queryset, info)
        filters = info._field.get_filters()
        result = get_cached_result(info.context.request)["Content"]
        # TODO: perm check for deleted and hidden
        hidden = filters.hidden
        deleted = filters.deleted
        if True:
            hidden = UseCriteria.FALSE

        print("filters.clusters", filters.clusters)
        if filters.clusters is not None:
            queryset = fetch_by_id(
                queryset,
                filters.clusters,
                prefix="cluster__",
                limit_ids=None,
            )

        if filters.public != UseCriteriaPublic.TOKEN:
            pass
        elif filters.public != UseCriteriaPublic.IGNORE:
            # should only include public contents with public cluster
            # if no clusters are specified (e.g. root query)
            if filters.public == UseCriteriaPublic.TRUE:
                if not filters.clusters:
                    queryset = queryset.filter(
                        state__in=constants.public_states,
                        cluster__public=True,
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
                ~Q(state__in=constants.public_states) | Q(cluster__public=True)
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
