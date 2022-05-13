from __future__ import annotations

from typing import Optional, List
import strawberry
import dataclasses
from strawberry.types import Info
from strawberry_django_plus import relay, gql

from ...utils.auth import get_cached_result
from ...actions.view import fetch_contents
from ...models import (
    ContentReference,
)
from ..shared import DeleteRecursive, UseCriteria


@gql.input
class ContentReferenceFilter:
    states: Optional[List[str]] = None
    includeTypes: Optional[List[str]] = None
    excludeTypes: Optional[List[str]] = None
    includeTags: Optional[List[str]] = None
    excludeTags: Optional[List[str]] = None
    contentHashes: Optional[List[str]] = None
    deleted: UseCriteria = UseCriteria.FALSE
    groups: Optional[List[str]] = None


for i in dataclasses.fields(ContentReferenceFilter):
    setattr(
        ContentReferenceFilter,
        f"filter_{i.name}",
        lambda self, queryset: queryset,
    )


@gql.django.type(ContentReference, name="ContentReference")
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
    ) -> strawberry.LazyType["ContentNode", ".contents"]:  # noqa F821,F722
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"].filter(references=self),
            result["actions"],
        ).first()

    @gql.django.field
    def target(
        self, info: Info
    ) -> strawberry.LazyType["ContentNode", ".contents"]:  # noqa F821,F722
        result = get_cached_result(info.context.request)["Content"]
        return fetch_contents(
            result["objects"].filter(referencedBy=self),
            result["actions"],
        ).first()
