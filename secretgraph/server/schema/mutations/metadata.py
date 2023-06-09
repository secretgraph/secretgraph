from __future__ import annotations

import logging
from itertools import chain
from typing import List, Optional

import strawberry
from django.db import transaction
from django.db.models import Exists, OuterRef, Value
from strawberry import relay
from strawberry.types import Info

from ...actions.update import manage_actions_fn, update_metadata_fn
from ...models import Cluster, Content, ContentTag, Net, SGroupProperty
from ...signals import generateFlexid
from ...utils.arguments import check_actions, pre_clean_update_content_args
from ...utils.auth import (
    fetch_by_id,
    get_cached_net_properties,
    ids_to_results,
)
from ..arguments import ActionInput, AuthList, ReferenceInput
from ..shared import MetadataOperations

logger = logging.getLogger(__name__)


@strawberry.type
class RegenerateFlexidMutation:
    updated: List[relay.GlobalID]


def regenerate_flexid(
    info: Info,
    ids: List[strawberry.ID],  # ID or cluster global name
    authorization: Optional[AuthList] = None,
) -> RegenerateFlexidMutation:
    if "manage_update" in get_cached_net_properties(
        info.context["request"], authset=authorization
    ):
        results = {
            "Content": {
                "objects_without_public": fetch_by_id(
                    Content.objects.all(), ids, limit_ids=None
                )
            },
            "Cluster": {
                "objects_without_public": fetch_by_id(
                    Cluster.objects.all(),
                    ids,
                    limit_ids=None,
                    check_short_name=True,
                )
            },
        }
    else:
        results = ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            scope="update",
            authset=authorization,
            cacheName=None,
        )
    updated = []
    for result in results.values():
        for obj in result["objects_without_public"]:
            generateFlexid(type(obj), obj, True)
            updated.append(obj.flexid_cached)
    return RegenerateFlexidMutation(updated=updated)


# only admin/moderator
@strawberry.type
class MarkMutation:
    updated: List[relay.GlobalID]


def mark(
    info,
    ids: List[strawberry.ID],  # ID or cluster global name
    hidden: Optional[bool] = None,
    featured: Optional[bool] = None,
    active: Optional[bool] = None,
    authorization: Optional[AuthList] = None,
) -> MarkMutation:
    if active is not None:
        if get_cached_net_properties(
            info.context["request"], authset=authorization
        ).isdisjoint({"manage_active", "manage_user"}):
            active = None
    contents = Content.objects.none()
    clusters = Cluster.objects.none()
    if hidden is not None:
        if "allow_hidden" in get_cached_net_properties(
            info.context["request"], authset=authorization
        ):
            contents = Content.objects.all()
        else:
            dProperty = SGroupProperty.objects.get_or_create(
                name="allow_hidden"
            )[0]
            cgroups = dProperty.clusterGroups.all()
            contents = Content.objects.filter(cluster__groups__in=cgroups)
        contents = fetch_by_id(contents, ids, limit_ids=None)

        contents.update(hidden=hidden)
    if featured is not None or active is not None:
        clusters_all = fetch_by_id(
            Cluster.objects.all(), ids, limit_ids=None, check_short_name=True
        )
        if featured is not None:
            if "allow_featured" in get_cached_net_properties(
                info.context["request"], authset=authorization
            ):
                clusters = clusters_all
            else:
                dProperty = SGroupProperty.objects.get_or_create(
                    name="allow_featured"
                )[0]
                cgroups = dProperty.clusterGroups.all()
                clusters = clusters_all.filter(groups__in=cgroups)

            clusters.filter(globalNameRegisteredAt__isnull=False).update(
                featured=featured
            )
        # must be last, clusters is now filtered
        if active is not None:
            Net.objects.filter(
                Exists(clusters_all.filter(net_id=OuterRef("id")))
            ).update(active=active)
            # as all clusters are updated, replace filtered with all
            clusters = clusters_all

    return MarkMutation(
        updated=chain(
            clusters.values_list("flexid_cached", flat=True),
            contents.values_list("flexid_cached", flat=True),
        )
    )


@strawberry.type
class MetadataUpdateMutation:
    updated: List[relay.GlobalID]


def update_metadata(
    info: Info,
    ids: List[relay.GlobalID],
    state: Optional[str] = None,
    tags: Optional[List[str]] = None,
    references: Optional[List[ReferenceInput]] = None,
    actions: Optional[List[ActionInput]] = None,
    operation: Optional[MetadataOperations] = MetadataOperations.APPEND,
    authorization: Optional[AuthList] = None,
) -> MetadataUpdateMutation:
    manage_update = "manage_update" in get_cached_net_properties(
        info.context["request"], authset=authorization
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
        clusters = fetch_by_id(
            Cluster.objects.all(),
            ids,
            limit_ids=None,
        )
    else:
        result = ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            scope="update",
            authset=authorization,
            cacheName=None,
        )
        cleaned = pre_clean_update_content_args(
            tags, state, references, actions, result["Contents"]
        )

        tags = cleaned["tags"]
        references = cleaned["references"]
        # immutable are excluded
        contents = result["Content"]["objects_without_public"].annotate(
            has_immutable=Value(False)
        )
        clusters = result["Clusters"]["objects_without_public"]
        if clusters:
            check_actions(actions, result["Clusters"])

    ops = []
    for content_obj in contents:
        ops.append(
            update_metadata_fn(
                info.context["request"],
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
            ops.append(
                manage_actions_fn(
                    info.context["request"],
                    content_obj,
                    actions,
                    authset=authorization,
                )
            )
    if actions and clusters:
        for cluster_obj in clusters:
            ops.append(
                manage_actions_fn(
                    info.context["request"],
                    cluster_obj,
                    actions,
                    authset=authorization,
                )
            )

    updated = set()
    with transaction.atomic():
        for f in ops:
            updated.add(f().flexid_cached)
    return MetadataUpdateMutation(updated=list(updated))
