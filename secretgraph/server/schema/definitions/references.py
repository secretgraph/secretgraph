from typing import TYPE_CHECKING, Annotated, Optional, List, Iterable
from strawberry.types import Info
from strawberry_django_plus import relay, gql

from ...utils.auth import get_cached_result
from ...actions.fetch import fetch_contents
from ...models import (
    ContentReference,
)
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
    ):
        result = get_cached_result(info.context["request"])["Content"]
        queryset = ContentReference.objects.all()
        try:
            source, target, group = id.node_id.split("|", 2)
            return queryset.get(
                source__in=fetch_contents(
                    result["objects"],
                    clustersAreRestricted=True,
                    ids=source,
                ),
                target__in=fetch_contents(
                    result["objects"],
                    clustersAreRestricted=True,
                    ids=target,
                ),
                group=group,
            )
        except (ContentReference.DoesNotExist, ValueError) as exc:
            if required:
                raise exc
            return None

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Optional[Info] = None,
        node_ids: Optional[Iterable[str]] = None,
    ) -> None:
        raise NotImplementedError

    @gql.django.field
    def source(
        self, info: Info
    ) -> Annotated["ContentNode", gql.lazy(".contents")]:
        result = get_cached_result(info.context["request"])["Content"]
        return fetch_contents(
            result["objects"].filter(references=self),
            clustersAreRestricted=True,
        ).first()

    @gql.django.field
    def target(
        self, info: Info
    ) -> Annotated["ContentNode", gql.lazy(".contents")]:
        result = get_cached_result(info.context["request"])["Content"]
        return fetch_contents(
            result["objects"].filter(referencedBy=self),
            clustersAreRestricted=True,
        ).first()
