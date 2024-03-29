import logging
from typing import Optional

import strawberry
from asgiref.sync import sync_to_async
from django.db import transaction
from django.db.models import Exists, OuterRef, Value
from strawberry import relay
from strawberry.types import Info

from ...actions.update import (
    apply_groups,
    calculate_groups,
    manage_actions_fn,
    update_content_metadata_fn,
)
from ...models import (
    Cluster,
    ClusterGroup,
    Content,
    ContentTag,
    Net,
    NetGroup,
    SGroupProperty,
)
from ...signals import agenerateFlexidAndDownloadId
from ...utils.arguments import check_actions, pre_clean_update_content_args
from ...utils.auth import (
    ain_cached_net_properties_or_user_special,
    fetch_by_id_noconvert,
    ids_to_results,
)
from ..arguments import ActionInput, AuthList, ReferenceInput
from ..shared import MetadataOperations

logger = logging.getLogger(__name__)


@strawberry.type
class RegenerateFlexidMutation:
    updated: list[relay.GlobalID]


async def mutate_regenerate_flexid(
    info: Info,
    ids: list[strawberry.ID],  # ID or cluster global name
    authorization: Optional[AuthList] = None,
) -> RegenerateFlexidMutation:
    if await ain_cached_net_properties_or_user_special(
        info.context["request"], "manage_update", authset=authorization
    ):
        results = {
            "Content": {
                "objects_without_public": fetch_by_id_noconvert(
                    Content.objects.all(), ids
                )
            },
            "Cluster": {
                "objects_without_public": fetch_by_id_noconvert(
                    Cluster.objects.all(),
                    ids,
                    check_short_name=True,
                )
            },
        }
    else:
        results = await ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            scope="update",
            authset=authorization,
            cacheName=None,
        )
    updated = []
    for result in results.values():
        async for obj in result["objects_without_public"]:
            await agenerateFlexidAndDownloadId(type(obj), obj, True)
            updated.append(obj.flexid_cached)
    return RegenerateFlexidMutation(updated=updated)


# only admin/moderator
@strawberry.type
class MarkMutation:
    updated: list[relay.GlobalID]


async def mutate_update_mark(
    info: Info,
    ids: list[strawberry.ID],  # ID or cluster global name
    hidden: Optional[bool] = None,
    featured: Optional[bool] = None,
    active: Optional[bool] = None,
    authorization: Optional[AuthList] = None,
) -> MarkMutation:
    if active is not None:
        if await ain_cached_net_properties_or_user_special(
            info.context["request"],
            "manage_active",
            "manage_user",
            authset=authorization,
        ):
            active = None
    contents = Content.objects.none()
    clusters = Cluster.objects.none()
    if hidden is not None:
        if await ain_cached_net_properties_or_user_special(
            info.context["request"], "allow_hidden", authset=authorization
        ):
            contents = Content.objects.all()
        else:
            dProperty = (
                await SGroupProperty.objects.aget_or_create(name="allow_hidden")
            )[0]
            cgroups = dProperty.clusterGroups.all()
            contents = Content.objects.filter(cluster__groups__in=cgroups)
        contents = fetch_by_id_noconvert(contents, ids)

        await contents.aupdate(hidden=hidden)
    if featured is not None or active is not None:
        clusters_all = fetch_by_id_noconvert(
            Cluster.objects.all(), ids, check_short_name=True
        )
        if featured is not None:
            if await ain_cached_net_properties_or_user_special(
                info.context["request"], "allow_featured", authset=authorization
            ):
                clusters = clusters_all
            else:
                dProperty = (
                    await SGroupProperty.objects.aget_or_create(name="allow_featured")
                )[0]
                cgroups = dProperty.clusterGroups.all()
                clusters = clusters_all.filter(groups__in=cgroups)

            await clusters.filter(globalNameRegisteredAt__isnull=False).aupdate(
                featured=featured
            )
        # must be last, clusters is now filtered
        if active is not None:
            await Net.objects.filter(
                Exists(clusters_all.filter(net_id=OuterRef("id")))
            ).aupdate(active=active)
            # as all clusters are updated, replace filtered with all
            clusters = clusters_all
    retval = [
        flexid_cached
        async for flexid_cached in clusters.distinct().values_list(
            "flexid_cached", flat=True
        )
    ]
    async for flexid_cached in contents.distinct().values_list(
        "flexid_cached", flat=True
    ):
        retval.append(flexid_cached)

    return MarkMutation(updated=retval)


@strawberry.type
class MetadataUpdateMutation:
    updated: list[relay.GlobalID]


async def mutate_update_metadata(
    info: Info,
    ids: list[relay.GlobalID],
    state: Optional[str] = None,
    tags: Optional[list[str]] = None,
    references: Optional[list[ReferenceInput]] = None,
    actions: Optional[list[ActionInput]] = None,
    clusterGroups: Optional[list[str]] = None,
    netGroups: Optional[list[str]] = None,
    operation: Optional[MetadataOperations] = MetadataOperations.APPEND,
    authorization: Optional[AuthList] = None,
) -> MetadataUpdateMutation:
    manage_update = await ain_cached_net_properties_or_user_special(
        info.context["request"], "manage_update", authset=authorization
    )
    if manage_update:
        contents = fetch_by_id_noconvert(
            Content.objects.filter(locked__isnull=True).annotate(
                has_immutable=Exists(
                    ContentTag.objects.filter(
                        content_id=OuterRef("pk"),
                        tag="immutable",
                    )
                )
            ),
            ids,
        )
        clusters = fetch_by_id_noconvert(
            Cluster.objects.all(),
            ids,
        )
    else:
        result = await ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            scope="update",
            authset=authorization,
            cacheName=None,
        )
        cleaned = pre_clean_update_content_args(
            tags, state, references, actions, result["Content"]
        )

        tags = cleaned["tags"]
        references = cleaned["references"]
        # immutable are excluded in action
        contents = (
            result["Content"]["objects_without_public"]
            .filter(locked__isnull=True)
            .annotate(has_immutable=Value(False))
        )
        clusters = result["Cluster"]["objects_without_public"]
        if clusters and actions is not None:
            check_actions(actions, result["Cluster"])
    clusterGroups_qset = None
    if clusterGroups is not None and clusters:
        clusterGroups_qset = calculate_groups(
            ClusterGroup,
            groups=clusterGroups,
            operation=operation,
            admin=manage_update,
        )
    netGroups_qset = None
    nets = Net.objects.none()
    primaryForClusters = Cluster.objects.none()
    if netGroups is not None and clusters:
        nets = Net.objects.filter(primaryCluster__in=clusters)
        primaryForClusters = clusters.filter(primaryFor__in=nets)
        if nets:
            netGroups_qset = calculate_groups(
                NetGroup,
                groups=netGroups,
                operation=operation,
                admin=manage_update,
            )

    ops = []
    for content_obj in contents:
        ops.append(
            await update_content_metadata_fn(
                info.context["request"],
                content_obj,
                state=state if not content_obj.has_immutable else None,
                tags=tags if not content_obj.has_immutable or manage_update else None,
                references=references if not content_obj.has_immutable else None,
                operation=operation,
                authset=authorization,
            )
        )
        if actions:
            ops.append(
                await manage_actions_fn(
                    info.context["request"],
                    content_obj,
                    actions,
                    authset=authorization,
                )
            )
    if actions and clusters:
        for cluster_obj in clusters:
            ops.append(
                await manage_actions_fn(
                    info.context["request"],
                    cluster_obj,
                    actions,
                    authset=authorization,
                )
            )

    updated = set()

    @sync_to_async
    def save_fn():
        with transaction.atomic():
            for f in ops:
                updated.add(f().flexid_cached)
            if apply_groups(clusters, clusterGroups_qset, operation=operation):
                updated.update(clusters.values_list("flexid_cached", flat=True))

            if apply_groups(nets, netGroups_qset, operation=operation):
                updated.update(
                    primaryForClusters.values_list("flexid_cached", flat=True)
                )

    await save_fn()

    return MetadataUpdateMutation(updated=list(updated))
