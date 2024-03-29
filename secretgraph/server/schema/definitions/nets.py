from typing import Iterable

import strawberry_django
from django.conf import settings
from django.db.models import Subquery
from strawberry import relay
from strawberry.types import Info

from ...actions.fetch import fetch_clusters
from ...models import Cluster, Net
from ...utils.auth import (
    ain_cached_net_properties_or_user_special,
    get_cached_result,
)


@strawberry_django.type(Net, name="Net")
class NetNode(relay.Node):
    # Note: needs to added to types
    user_name: str

    @strawberry_django.field()
    async def groups(self, info: Info) -> list[str]:
        # permissions allows to see the nonselectable net groups
        # allow_hidden_net: have mod  rights plus allowance to see nets,
        #   so the groups are handy for communication
        # manage_net_groups: required for correctly updating groups
        if await ain_cached_net_properties_or_user_special(
            info.context["request"], "allow_hidden_net", "manage_net_groups"
        ):
            return [val async for val in self.groups.values_list("name", flat=True)]
        else:
            return [
                val
                async for val in self.groups.filter(hidden=False).values_list(
                    "name", flat=True
                )
            ]

    @classmethod
    async def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Iterable[str],
        required: bool = False,
    ):
        if not isinstance(node_ids, (tuple, list)):
            node_ids = list(node_ids)
        if len(node_ids) > settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS:
            raise ValueError("too many nodes requested")
        if await ain_cached_net_properties_or_user_special(
            info.context["request"], "manage_user"
        ):
            query = Cluster.objects.all()
        else:
            query = (
                await get_cached_result(
                    info.context["request"],
                    scope="manage",
                    cacheName="secretgraphNetResult",
                ).aat("Cluster")
            )["objects_without_public"]
        # for allowing specifing global name and permission check
        query = Net.objects.filter(
            primaryCluster__in=Subquery(
                fetch_clusters(
                    query,
                    ids=node_ids,
                    limit_ids=None,
                ).values("id")
            )
        )
        querydict = {}
        async for el in query:
            querydict[el.name] = el
            querydict[el.flexid] = el
            querydict[el.flexid_cached] = el

        if required:
            return [querydict[nid] for nid in node_ids]
        else:
            return [querydict.get(nid) for nid in node_ids]

    @classmethod
    def resolve_id(
        cls,
        root: Net,
        *,
        info: Info,
    ) -> str:
        return root.primaryCluster.flexid
