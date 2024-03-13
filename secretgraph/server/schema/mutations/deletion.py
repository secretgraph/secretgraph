import logging
from datetime import datetime, timedelta
from typing import List, Optional

import strawberry
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q, Subquery
from django.utils import timezone
from strawberry import relay
from strawberry.types import Info

from ...models import Cluster, Content
from ...utils.auth import (
    ain_cached_net_properties_or_user_special,
    fetch_by_id_noconvert,
    ids_to_results,
)
from ..arguments import AuthList

logger = logging.getLogger(__name__)


@strawberry.type
class DeleteContentOrClusterMutation:
    latestDeletion: Optional[datetime] = None


async def mutate_delete_content_or_cluster(
    info: Info,
    ids: List[strawberry.ID],  # ID or cluster global name
    when: Optional[datetime] = None,
    authorization: Optional[AuthList] = None,
) -> DeleteContentOrClusterMutation:
    now = timezone.now()

    manage_deletion = await ain_cached_net_properties_or_user_special(
        info.context["request"], "manage_deletion", authset=authorization
    )
    if manage_deletion:
        contents = fetch_by_id_noconvert(Content.objects.all(), ids)
        clusters = fetch_by_id_noconvert(
            Cluster.objects.all(), ids, check_short_name=True
        )
    else:
        results = await ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            scope="delete",
            authset=authorization,
            cacheName="secretgraphDeleteResult",
        )
        contents = results["Content"]["objects_without_public"]
        clusters = results["Cluster"]["objects_without_public"]
    if when:
        when_safe = when if manage_deletion else max(now + timedelta(minutes=20), when)
        contents.update(markForDestruction=when_safe)
        await Content.objects.filter(
            cluster_id__in=Subquery(clusters.values("id"))
        ).aupdate(markForDestruction=when_safe)
        clusters.update(markForDestruction=when)
    else:
        now_plus_x = now + timedelta(minutes=20)
        await contents.filter(
            Q(markForDestruction__isnull=True) | Q(markForDestruction__gt=now_plus_x)
        ).aupdate(markForDestruction=now_plus_x)
        await Content.objects.filter(
            Q(markForDestruction__isnull=True) | Q(markForDestruction__gt=now_plus_x),
            cluster_id__in=Subquery(clusters.values("id")),
        ).aupdate(markForDestruction=now_plus_x)
        clusters.filter(
            Q(markForDestruction__isnull=True) | Q(markForDestruction__gt=now)
        ).update(markForDestruction=now)
    try:
        calc_last = await Content.objects.filter(
            Q(id__in=Subquery(contents.values("id")))
            | Q(cluster_id__in=Subquery(clusters.values("id"))),
            markForDestruction__isnull=False,
        ).alatest("markForDestruction")
    except ObjectDoesNotExist:
        calc_last = None

    return DeleteContentOrClusterMutation(
        latestDeletion=calc_last.markForDestruction if calc_last else None
    )


@strawberry.type
class ResetDeletionContentOrClusterMutation:
    restored: List[relay.GlobalID]


async def mutate_reset_deletion_content_or_cluster(
    info: Info,
    ids: List[strawberry.ID],  # ID or cluster global name
    authorization: Optional[AuthList] = None,
) -> ResetDeletionContentOrClusterMutation:
    manage_deletion = await ain_cached_net_properties_or_user_special(
        info.context["request"], "manage_deletion", authset=authorization
    )
    if manage_deletion:
        contents = fetch_by_id_noconvert(Content.objects.all(), ids)
        clusters = fetch_by_id_noconvert(Cluster.objects.all(), ids)
    else:
        results = await ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            scope="delete",
            authset=authorization,
            cacheName="secretgraphDeleteResult",
        )
        contents = results["Content"]["objects_without_public"]
        clusters = results["Cluster"]["objects_without_public"]
    clusters = Cluster.objects.filter(
        Q(id__in=Subquery(clusters.values("id")))
        | Q(id__in=Subquery(contents.values("cluster_id"))),
        markForDestruction__isnull=False,
    )
    clusters.update(markForDestruction=None)
    # undelete all contents if cluster is undeleted or
    # undelete contents of clusters not in deletion
    contents = Content.objects.filter(
        Q(cluster_id__in=Subquery(clusters.values("id")))
        | Q(
            id__in=Subquery(contents.values("id")),
            cluster__markForDestruction=None,
        ),
        markForDestruction__isnull=False,
    )
    contents.update(markForDestruction=None)
    return ResetDeletionContentOrClusterMutation(
        restored=[
            *contents.filter(id__in=Subquery(contents.values("id"))).values_list(
                "flexid_cached", flat=True
            ),
            *clusters.filter(id__in=Subquery(clusters.values("id"))).values_list(
                "flexid_cached", flat=True
            ),
        ],
    )
