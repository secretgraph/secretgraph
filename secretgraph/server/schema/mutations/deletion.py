from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional

import strawberry
from django.db.models import Q, Subquery
from django.utils import timezone
from strawberry.types import Info
from strawberry_django_plus import relay

from ...models import Cluster, Content
from ...utils.auth import (
    fetch_by_id,
    get_cached_net_properties,
    ids_to_results,
)
from ..arguments import AuthList

logger = logging.getLogger(__name__)


@strawberry.type
class DeleteContentOrClusterMutation:
    latestDeletion: Optional[datetime] = None


def delete_content_or_cluster(
    info: Info,
    ids: List[strawberry.ID],  # ID or cluster global name
    when: Optional[datetime] = None,
    authorization: Optional[AuthList] = None,
) -> DeleteContentOrClusterMutation:
    now = timezone.now()

    allow_deletion = "allow_deletion" in get_cached_net_properties(
        info.context["request"], authset=authorization
    )
    if allow_deletion:
        contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
        clusters = fetch_by_id(
            Cluster.objects.all(), ids, limit_ids=None, check_short_name=True
        )
    else:
        results = ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            "delete",
            authset=authorization,
        )
        contents = results["Content"]["objects"]
        clusters = results["Cluster"]["objects"]
    if when:
        when_safe = (
            when if allow_deletion else max(now + timedelta(minutes=20), when)
        )
        contents.update(markForDestruction=when_safe)
        Content.objects.filter(
            cluster_id__in=Subquery(clusters.values("id"))
        ).update(markForDestruction=when_safe)
        clusters.update(markForDestruction=when)
    else:
        now_plus_x = now + timedelta(minutes=20)
        contents.filter(
            Q(markForDestruction__isnull=True)
            | Q(markForDestruction__gt=now_plus_x)
        ).update(markForDestruction=now_plus_x)
        Content.objects.filter(
            Q(markForDestruction__isnull=True)
            | Q(markForDestruction__gt=now_plus_x),
            cluster_id__in=Subquery(clusters.values("id")),
        ).update(markForDestruction=now_plus_x)
        clusters.filter(
            Q(markForDestruction__isnull=True) | Q(markForDestruction__gt=now)
        ).update(markForDestruction=now)
    calc_last = Content.objects.filter(
        Q(id__in=Subquery(contents.values("id")))
        | Q(cluster_id__in=Subquery(clusters.values("id"))),
        markForDestruction__isnull=False,
    ).latest("markForDestruction")

    return DeleteContentOrClusterMutation(
        latestDeletion=calc_last.markForDestruction if calc_last else None
    )


@strawberry.type
class ResetDeletionContentOrClusterMutation:
    restored: List[relay.GlobalID]


def reset_deletion_content_or_cluster(
    info: Info,
    ids: List[strawberry.ID],  # ID or cluster global name
    authorization: Optional[AuthList] = None,
) -> ResetDeletionContentOrClusterMutation:
    if "allow_deletion" in get_cached_net_properties(
        info.context["request"], authset=authorization
    ):
        contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
        clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
    else:
        results = ids_to_results(
            info.context["request"],
            ids,
            (Content, Cluster),
            "delete",
            authset=authorization,
        )
        contents = results["Content"]["objects"]
        clusters = results["Cluster"]["objects"]
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
            *contents.filter(
                id__in=Subquery(contents.values("id"))
            ).values_list("flexid_cached", flat=True),
            *clusters.filter(
                id__in=Subquery(clusters.values("id"))
            ).values_list("flexid_cached", flat=True),
        ],
    )
