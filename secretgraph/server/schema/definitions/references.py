from typing import TYPE_CHECKING, Annotated, Iterable, Optional

import strawberry_django
from django.conf import settings
from django.db import models
from django.db.models.functions import Concat
from strawberry import lazy, relay
from strawberry.types import Info

from ...actions.fetch import fetch_contents
from ...models import ContentReference
from ...utils.auth import get_cached_result
from ..shared import DeleteRecursive

if TYPE_CHECKING:
    from .contents import ContentNode


@strawberry_django.type(ContentReference, name="ContentReference")
class ContentReferenceNode(relay.Node):
    group: str
    extra: str
    relay_id: relay.NodeID[str]

    deleteRecursive: DeleteRecursive

    @classmethod
    def get_queryset(cls, queryset, info: Info, **kwargs):
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
        if not isinstance(node_ids, (tuple, list)):
            node_ids = list(node_ids)
        if len(node_ids) > settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS:
            raise ValueError("too many nodes requested")
        # check permissions
        result = get_cached_result(info.context["request"])["Content"]
        queryset = ContentReference.objects.filter(
            source__in=result["objects_with_public"],
            target__in=result["objects_with_public"],
        )

        queryset = queryset.filter(relay_id__in=node_ids)

        querydict = {el.relay_id: el for el in queryset}
        if required:
            return [querydict[nid] for nid in node_ids]
        else:
            return [querydict.get(nid) for nid in node_ids]

    @strawberry_django.field
    def source(
        self, info: Info
    ) -> Optional[Annotated["ContentNode", lazy(".contents")]]:
        result = get_cached_result(info.context["request"])["Content"]
        return (
            fetch_contents(
                result["objects_with_public"].filter(references=self),
                clustersAreRestrictedOrAdmin=True,
            )
            .filter(locked__isnull=True)
            .first()
        )

    @strawberry_django.field
    def target(
        self, info: Info
    ) -> Optional[Annotated["ContentNode", lazy(".contents")]]:
        result = get_cached_result(info.context["request"])["Content"]
        return (
            fetch_contents(
                result["objects_with_public"].filter(referencedBy=self),
                clustersAreRestrictedOrAdmin=True,
            )
            .filter(locked__isnull=True)
            .first()
        )
