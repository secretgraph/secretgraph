import asyncio
from collections.abc import AsyncGenerator
from typing import List, Optional

from asgiref.sync import sync_to_async
from django.utils import timezone
from strawberry.types import Info
from strawberry_django_plus import relay
from django.db.models import Value

from ..models import Cluster, Content
from ..utils.auth import ids_to_results
from .arguments import AuthList


NodeUpdateSubscription = AsyncGenerator[List[relay.Node], None]


@sync_to_async(thread_sensitive=True)
def valid_node_ids(request, ids, authorization=None):
    results = ids_to_results(
        request,
        ids,
        klasses=(Cluster, Content),
        scope="view",
        cacheName="secretgraphResult",
        authset=authorization,
    )
    return {
        "Cluster": list(
            results["Cluster"]["objects_with_public"].values_list(
                "flexid", flat=True
            )
        ),
        "Content": list(
            results["Content"]["objects_with_public"].values_list(
                "flexid", flat=True
            )
        ),
    }


@sync_to_async(thread_sensitive=True)
def poll_flexids_for_nodes(ids_dict, timestamp):
    return [
        *Cluster.objects.filter(
            flexid__in=ids_dict["Cluster"], updated__gte=timestamp
        ).annotate(limited=Value(True)),
        *Content.objects.filter(
            flexid__in=ids_dict["Content"], updated__gte=timestamp
        ).annotate(limited=Value(True)),
    ]


async def subscribe_node_updates(
    info: Info,
    ids: List[relay.GlobalID],
    authorization: Optional[AuthList] = None,
) -> NodeUpdateSubscription:
    timestamp = timezone.now()
    ids_dict = await valid_node_ids(info.context, ids[:100], authorization)
    if not ids_dict["Cluster"] and not ids_dict["Content"]:
        yield []
        return

    while True:
        nodes = await poll_flexids_for_nodes(ids_dict, timestamp)
        if len(nodes):
            yield nodes

        timestamp = timezone.now()
        await asyncio.sleep(10)
