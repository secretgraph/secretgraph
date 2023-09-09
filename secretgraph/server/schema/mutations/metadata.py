import logging
from itertools import chain
from typing import Optional

import strawberry
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
from ...signals import generateFlexid
from ...utils.arguments import check_actions, pre_clean_update_content_args
from ...utils.auth import (
    fetch_by_id_noconvert,
    get_cached_net_properties,
    ids_to_results,
)
from ..arguments import ActionInput, AuthList, ReferenceInput
from ..shared import MetadataOperations

logger = logging.getLogger(__name__)


@strawberry.type
class RegenerateFlexidMutation:
    updated: list[relay.GlobalID]


def mutate_regenerate_flexid(
    info: Info,
    ids: list[strawberry.ID],  # ID or cluster global name
    authorization: Optional[AuthList] = None,
) -> RegenerateFlexidMutation:
    if "manage_update" in get_cached_net_properties(
        info.context["request"], authset=authorization
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
    updated: list[relay.GlobalID]


def mutate_update_mark(
    info,
    ids: list[strawberry.ID],  # ID or cluster global name
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
        contents = fetch_by_id_noconvert(contents, ids)

        contents.update(hidden=hidden)
    if featured is not None or active is not None:
        clusters_all = fetch_by_id_noconvert(
            Cluster.objects.all(), ids, check_short_name=True
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
    updated: list[relay.GlobalID]


def mutate_update_metadata(
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
    manage_update = "manage_update" in get_cached_net_properties(
        info.context["request"], authset=authorization
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
        # immutable are excluded in action
        contents = (
            result["Content"]["objects_without_public"]
            .filter(locked__isnull=True)
            .annotate(has_immutable=Value(False))
        )
        clusters = result["Clusters"]["objects_without_public"]
        if clusters and actions is not None:
            check_actions(actions, result["Clusters"])
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
            update_content_metadata_fn(
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
        if apply_groups(clusters, clusterGroups_qset, operation=operation):
            updated.update(clusters.values_list("flexid_cached", flat=True))

        if apply_groups(nets, netGroups_qset, operation=operation):
            updated.update(
                primaryForClusters.values_list("flexid_cached", flat=True)
            )

    return MetadataUpdateMutation(updated=list(updated))
