from __future__ import annotations

import logging
from datetime import datetime
from itertools import chain
from typing import List, Optional

import strawberry
from django.db.models import Q, Subquery
from django.utils import timezone
from strawberry.types import Info
from strawberry_django_plus import relay

from ...models import Cluster, Content
from ...utils.auth import fetch_by_id, get_cached_permissions, ids_to_results
from ..arguments import AuthList

logger = logging.getLogger(__name__)


@strawberry.type
class DeleteContentOrClusterMutation:
    latestDeletion: datetime

    @classmethod
    def mutate_and_get_payload(
        cls,
        info: Info,
        ids: List[relay.GlobalID],
        when: Optional[datetime],
        authorization: Optional[AuthList] = None,
    ) -> DeleteContentOrClusterMutation:
        now = timezone.now()

        if get_cached_permissions(info.context, authset=authorization)[
            "manage_deletion"
        ]:
            contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
            clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
        else:
            results = ids_to_results(
                info.context,
                ids,
                (Content, Cluster),
                "delete",
                authset=authorization,
            )
            contents = results["Content"]["objects"]
            clusters = results["Cluster"]["objects"]
        if when:
            when_x = max(now + datetime(minutes=20), when)
            contents.update(markForDestruction=when_x)
            Content.objects.filter(
                cluster_id__in=Subquery(clusters.values("id"))
            ).update(markForDestruction=when_x)
            clusters.update(markForDestruction=when)
        else:
            now_plus_x = now + datetime(minutes=20)
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
                Q(markForDestruction__isnull=True)
                | Q(markForDestruction__gt=now)
            ).update(markForDestruction=now)
        calc_last = Content.objects.filter(
            Q(id__in=Subquery(contents.values("id")))
            | Q(cluster_id__in=Subquery(clusters.values("id"))),
            markForDestruction__isnull=False,
        ).latest("markForDestruction")

        return cls(
            latestDeletion=calc_last.markForDestruction if calc_last else None
        )


@strawberry.type
class ResetDeletionContentOrClusterMutation:
    restored: List[relay.GlobalID]

    @relay.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
        info: Info,
        ids: List[relay.GlobalID],
        authorization: Optional[AuthList] = None,
    ) -> ResetDeletionContentOrClusterMutation:
        if get_cached_permissions(
            info.context["manage_deletion"], authset=authorization
        ):
            contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
            clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
        else:
            results = ids_to_results(
                info.context,
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
        return cls(
            restored=map(
                lambda x: relay.to_base64(type(x).__name__, x.flexid),
                chain(
                    contents.filter(id__in=Subquery(contents.values("id"))),
                    clusters.filter(id__in=Subquery(clusters.values("id"))),
                ),
            )
        )
