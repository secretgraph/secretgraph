from typing import TYPE_CHECKING, Annotated, Iterable, List, Optional

from django.db import models
from django.db.models.functions import Concat
from strawberry import relay
from strawberry.types import Info
from strawberry_django_plus import gql

from ...actions.fetch import fetch_contents
from ...models import ContentReference
from ...utils.auth import get_cached_result
from ..shared import DeleteRecursive, UseCriteria

if TYPE_CHECKING:
    from .contents import ContentNode


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


@gql.django.type(ContentReference, name="ContentReference")
class ContentReferenceNode(relay.Node):
    group: str
    extra: str
    relay_id: relay.NodeID[str]

    deleteRecursive: DeleteRecursive

    @classmethod
    def get_queryset(cls, queryset, info):
        return queryset.annotate(
            relay_id=Concat(
                models.F("source__flexid"),
                models.Value("|"),
                models.F("target__flexid"),
                models.Value("|"),
                models.F("group"),
            )
        )

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Iterable[str],
        required: bool = False,
    ):
        result = get_cached_result(info.context["request"])["Content"]
        queryset = ContentReference.objects.filter(
            source__in=result["objects_with_public"],
            target__in=result["objects_with_public"],
        )

        return queryset.filter(relay_id__in=node_ids)

    @gql.django.field
    def source(
        self, info: Info
    ) -> Annotated["ContentNode", gql.lazy(".contents")]:
        result = get_cached_result(info.context["request"])["Content"]
        return fetch_contents(
            result["objects_with_public"].filter(references=self),
            clustersAreRestrictedOrAdmin=True,
        ).first()

    @gql.django.field
    def target(
        self, info: Info
    ) -> Annotated["ContentNode", gql.lazy(".contents")]:
        result = get_cached_result(info.context["request"])["Content"]
        return fetch_contents(
            result["objects_with_public"].filter(referencedBy=self),
            clustersAreRestrictedOrAdmin=True,
        ).first()
