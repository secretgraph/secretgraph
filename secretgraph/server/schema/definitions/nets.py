from typing import Iterable, Optional

import strawberry
import strawberry_django
from django.conf import settings
from django.db.models import Q, Subquery, Value
from strawberry import relay
from strawberry.types import Info

from ....core.constants import UserSelectable
from ...actions.fetch import fetch_clusters
from ...models import Net
from ...utils.auth import get_cached_net_properties, get_cached_result


@strawberry_django.type(Net, name="Net")
class NetNode(relay.Node):
    # Note: needs to added to types
    user_name: str

    @strawberry_django.field()
    def groups(self, info: Info) -> list[str]:
        # permissions allows to see the nonselectable net groups
        # allow_hidden: have mod rights,
        #   so the groups are handy for communication
        # manage_groups: required for correctly updating groups
        props = get_cached_net_properties(info.context["request"])
        if "allow_hidden" in props or "manage_groups" in props:
            return list(self.groups.values_list("name", flat=True))
        else:
            return list(
                self.groups.exclude(
                    userSelectable=UserSelectable.NONE.value
                ).values_list("name", flat=True)
            )

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Iterable[str],
        required: bool = False,
    ):
        result = get_cached_result(
            info.context["request"],
            scope="manage",
            cacheName="secretgraphNetResult",
        )["Cluster"]
        # for allowing specifing global name and permission check
        return Net.objects.filter(
            primaryCluster__in=Subquery(
                fetch_clusters(
                    result["objects_with_public"],
                    ids=node_ids,
                    limit_ids=settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS,
                ).values("id")
            )
        )

    @classmethod
    def resolve_id(
        cls,
        root: Net,
        *,
        info: Info,
    ) -> str:
        return root.primaryCluster.flexid
