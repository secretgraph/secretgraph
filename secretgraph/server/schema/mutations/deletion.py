from __future__ import annotations

import logging
from datetime import datetime, timedelta
from itertools import chain
from typing import List, Optional

import strawberry
from django.db.models import Q, Subquery
from django.utils import timezone
from strawberry.types import Info

from ...models import Cluster, Content
from ...utils.auth import fetch_by_id, get_cached_permissions, ids_to_results
from ..arguments import AuthList

logger = logging.getLogger(__name__)


@strawberry.type
class DeleteContentOrClusterMutation:
    latestDeletion: Optional[datetime] = None


def delete_content_or_cluster(
    info: Info,
    ids: List[strawberry.ID],
    when: Optional[datetime] = None,
    authorization: Optional[AuthList] = None,
) -> DeleteContentOrClusterMutation:
    now = timezone.now()

    if "manage_deletion" in get_cached_permissions(
        info.context.request, authset=authorization
    ):
        contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
        clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
    else:
        results = ids_to_results(
            info.context.request,
            ids,
            (Content, Cluster),
            "delete",
            authset=authorization,
        )
        contents = results["Content"]["objects"]
        clusters = results["Cluster"]["objects"]
    if when:
        when_x = max(now + timedelta(minutes=20), when)
        contents.update(markForDestruction=when_x)
        Content.objects.filter(
            cluster_id__in=Subquery(clusters.values("id"))
        ).update(markForDestruction=when_x)
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
    restored: List[strawberry.ID]


def reset_deletion_content_or_cluster(
    info: Info,
    ids: List[strawberry.ID],
    authorization: Optional[AuthList] = None,
) -> ResetDeletionContentOrClusterMutation:
    if "manage_deletion" in get_cached_permissions(
        info.context.request, authset=authorization
    ):
        contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
        clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
    else:
        results = ids_to_results(
            info.context.request,
            ids,
            (Content, Cluster),
            "delete",
            authset=authorization,
        )
        contents = results["Content"]["objects"]
        clusters = results["Cluster"]["objects"]
    contents = Content.objects.filter(
        Q(cluster_id__in=Subquery(clusters.values("id")))
        | Q(id__in=Subquery(contents.values("id"))),
        markForDestruction__isnull=False,
    )
    contents.update(markForDestruction=None)
    clusters = Cluster.objects.filter(
        Q(id__in=Subquery(clusters.values("id")))
        | Q(id__in=Subquery(contents.values("cluster_id"))),
        markForDestruction__isnull=False,
    )
    clusters.update(markForDestruction=None)
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
