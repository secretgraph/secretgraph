from __future__ import annotations

from typing import List, Optional
from itertools import chain
import logging

import strawberry
from strawberry.types import Info
from django.db import transaction
from django.db.models import Exists, OuterRef
from ..shared import MetadataOperations

from ...actions.update import (
    update_metadata_fn,
    manage_actions_fn,
)
from ...models import Cluster, Content, ContentTag, Net
from ...signals import generateFlexid
from ...utils.auth import (
    fetch_by_id,
    ids_to_results,
    get_cached_properties,
)
from ..arguments import AuthList, ActionInput, ReferenceInput

logger = logging.getLogger(__name__)


@strawberry.type
class RegenerateFlexidMutation:
    updated: List[strawberry.ID]


def regenerate_flexid(
    info: Info,
    ids: List[strawberry.ID],
    authorization: Optional[AuthList] = None,
) -> RegenerateFlexidMutation:
    if "manage_update" in get_cached_properties(
        info.context.request, authset=authorization
    ):
        results = {
            "Content": {
                "objects": fetch_by_id(
                    Content.objects.all(), ids, limit_ids=None
                )
            },
            "Cluster": {
                "objects": fetch_by_id(
                    Cluster.objects.all(), ids, limit_ids=None
                )
            },
        }
    else:
        results = ids_to_results(
            info.context.request,
            ids,
            (Content, Cluster),
            "update",
            authset=authorization,
        )
    updated = []
    for result in results.values():
        for obj in result["objects"]:
            generateFlexid(type(obj), obj, True)
            updated.append(obj.flexid_cached)
    return RegenerateFlexidMutation(updated=updated)


# only admin/moderator
@strawberry.type
class MarkMutation:
    markChanged: List[strawberry.ID]


def mark(
    info,
    ids: List[strawberry.ID],
    hidden: Optional[bool] = None,
    featured: Optional[bool] = None,
    active: Optional[bool] = None,
    authorization: Optional[AuthList] = None,
) -> MarkMutation:
    if featured is not None:
        if "manage_featured" not in get_cached_properties(
            info.context.request, authset=authorization
        ):
            featured = None
    if hidden is not None:
        if "manage_hidden" not in get_cached_properties(
            info.context.request, authset=authorization
        ):
            hidden = None
    if active is not None:
        if "manage_active" not in get_cached_properties(
            info.context.request, authset=authorization
        ):
            active = None
    contents = Content.objects.none()
    clusters = Cluster.objects.none()
    if hidden is not None:
        contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)

        contents.update(hidden=hidden)
    if featured is not None or active is not None:
        clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
        if featured is not None:
            clusters.filter(globalNameRegisteredAt__isnull=False).update(
                featured=featured
            )
        if active is not None:
            Net.objects.filter(
                Exists(clusters.filter(net_id=OuterRef("id")))
            ).update(active=active)

    return MarkMutation(
        markChanged=chain(
            clusters.values_list("flexid_cached", flat=True),
            contents.values_list("flexid_cached", flat=True),
        )
    )


@strawberry.type
class MetadataUpdateMutation:

    updated: List[strawberry.ID]


def update_metadata(
    info: Info,
    ids: List[strawberry.ID],
    state: Optional[str] = None,
    tags: Optional[List[str]] = None,
    references: Optional[List[ReferenceInput]] = None,
    actions: Optional[List[ActionInput]] = None,
    operation: Optional[MetadataOperations] = MetadataOperations.APPEND,
    authorization: Optional[AuthList] = None,
) -> MetadataUpdateMutation:

    manage_update = "manage_update" in get_cached_properties(
        info.context.request, authset=authorization
    )
    if manage_update:
        contents = fetch_by_id(
            Content.objects.annotate(
                has_immutable=Exists(
                    ContentTag.objects.filter(
                        content_id=OuterRef("pk"),
                        tag="immutable",
                    )
                )
            ),
            ids,
            limit_ids=None,
        )
    else:
        result = ids_to_results(
            info.context.request,
            ids,
            Content,
            "update",
            authset=authorization,
        )["Content"]
    requests = []
    for content_obj in result.objects.all():
        requests.append(
            update_metadata_fn(
                info.context.request,
                content_obj,
                state=state if not content_obj.has_immutable else None,
                tags=tags
                if not content_obj.has_immutable or manage_update
                else None,
                references=references
                if not content_obj.has_immutable
                else None,
                operation=operation,
                authset=authorization,
            )
        )
        if actions:
            requests.append(
                manage_actions_fn(
                    info.context.request,
                    content_obj,
                    actions,
                    authset=authorization,
                )
            )
    contents = []
    with transaction.atomic():
        for f in requests:
            contents.push(f().flexid_cached)
    return MetadataUpdateMutation(updated=contents)
