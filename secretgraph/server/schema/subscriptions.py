import asyncio
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, List, Optional

from asgiref.sync import sync_to_async
from django.db.models import Value
from django.utils import timezone
from strawberry import relay
from strawberry.types import Info

from ..models import Cluster, Content
from ..utils.auth import ids_to_results
from ..utils.misc import get_channel_layer
from .arguments import AuthList

if TYPE_CHECKING:
    from channels.layers import InMemoryChannelLayer

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
        *results["Cluster"]["objects_with_public"].values_list(
            "flexid_cached", flat=True
        )
        * results["Content"]["objects_with_public"].values_list(
            "flexid_cached", flat=True
        )
    }


@sync_to_async(thread_sensitive=True)
def poll_flexids_for_nodes(ids, timestamp):
    return [
        *Cluster.objects.filter(flexid_cached__in=ids, updated__gte=timestamp)
        .only("flexid_cached", "updateId", "name", "description")
        .annotate(reduced=Value(True)),
        *Content.objects.filter(flexid_cached__in=ids, updated__gte=timestamp)
        .only(
            "flexid_cached",
            "updateId",
            "contentHash",
            "cryptoParameters",
            "type",
            "state",
            "link",
        )
        .annotate(reduced=Value(True)),
    ]


async def wait_for_update(ids: set[str], channel: "InMemoryChannelLayer"):
    while True:
        updated_ids = await channel.receive("content_or_cluster.update")["relay_ids"]
        if not ids.isdisjoint(updated_ids):
            break


async def subscribe_node_updates(
    info: Info,
    ids: List[relay.GlobalID],
    authorization: Optional[AuthList] = None,
) -> NodeUpdateSubscription:
    timestamp = timezone.now()
    ids = await valid_node_ids(info.context, ids[:100], authorization)
    if not ids:
        yield []
        return
    channel = get_channel_layer()

    while True:
        nodes = await poll_flexids_for_nodes(ids, timestamp)
        if len(nodes):
            yield nodes

        timestamp = timezone.now()
        if channel:
            await wait_for_update(ids, channel)
        else:
            await asyncio.sleep(10)
