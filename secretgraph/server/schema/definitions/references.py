from __future__ import annotations

from typing import Optional, List
import strawberry
from strawberry.types import Info
from strawberry_django_plus import relay, gql
from django.db.models import QuerySet

from ...utils.auth import get_cached_result
from ...actions.view import fetch_contents
from ...models import (
    Content,
    ContentReference,
)
from ..shared import DeleteRecursive, UseCriteria


@gql.django.filter(ContentReference)
class ContentReferenceFilter:
    # queryset
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = None
    contentHashes: Optional[List[str]] = None
    deleted: UseCriteria = UseCriteria.FALSE

    # classical
    groups: Optional[List[str]] = None

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

    def filter_deleted(self, queryset):
        return queryset

    def filter_groups(self, queryset):
        if self.groups is not None:
            queryset = queryset.filter(group__in=self.groups)
        return queryset


@gql.django.type(
    ContentReference, filters=ContentReferenceFilter, name="ContentReference"
)
class ContentReferenceNode(relay.Node):
    group: str
    extra: str

    deleteRecursive: DeleteRecursive

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        return f"{root.source.flexid}|{root.target.flexid}|{root.group}"

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Info,
        required: bool = False,
    ) -> ContentReferenceNode:
        result = get_cached_result(info.context)["Content"]
        queryset = ContentReference.objects.all()
        try:
            source, target, group = id.node_id.split("|", 2)
            return queryset.get(
                source__in=fetch_contents(
                    result["objects"],
                    result["actions"],
                    ids=source,
                    noFetch=True,
                ),
                target__in=fetch_contents(
                    result["objects"],
                    result["actions"],
                    ids=target,
                    noFetch=True,
                ),
                group=group,
            )
        except ContentReference.DoesNotExist as exc:
            if required:
                raise exc
            return None
        except ValueError:
            return None

    @gql.django.field
    def source(
        self, info: Info
    ) -> strawberry.LazyType["ContentNode", ".contents"]:
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"].filter(references=self),
            result["actions"],
        ).first()

    @gql.django.field
    def target(
        self, info: Info
    ) -> strawberry.LazyType["ContentNode", ".contents"]:
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"].filter(referencedBy=self),
            result["actions"],
        ).first()

    def get_queryset(
        self, queryset, info: Info, filters: ContentReferenceFilter
    ) -> QuerySet[ContentReference]:
        if (
            not isinstance(self, Content)
            or self.limited
            or self.cluster_id == 1
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context.request)["Content"]
        query = result["objects"].exclude(hidden=True)
        filterob = {}

        if info.field_name == "references":
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
        else:
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
        return queryset.filter(
            **filterob,
        )
