from typing import Iterable, Optional

import strawberry
import strawberry_django
from django.conf import settings
from django.shortcuts import resolve_url
from django.urls import NoReverseMatch
from strawberry import relay
from strawberry.types import Info

from ...models import ClusterGroup, Content, NetGroup
from ...utils.auth import (
    ain_cached_net_properties_or_user_special,
    in_cached_net_properties_or_user_special,
)
from ..shared import UserSelectable


@strawberry_django.type(Content, name="InjectedKey")
class InjectedKeyNode:
    link: str

    @strawberry_django.field(only="contentHash")
    def hash(self) -> str:
        return self.contentHash.removeprefix("Key:")

    @classmethod
    def get_queryset(cls, queryset, info: Info) -> list[Content]:
        return queryset.filter(type="PublicKey", injectedFor__isnull=False)


@strawberry_django.type(ClusterGroup, name="ClusterGroup")
class ClusterGroupNode(relay.Node):
    @classmethod
    def resolve_id(cls, root, *, info: Info) -> str:
        return root.name

    name: str
    description: str
    userSelectable: UserSelectable
    hidden: bool
    injectedKeys: list[InjectedKeyNode]

    @strawberry_django.field()
    def properties(self) -> list[str]:
        return list(self.properties.values_list("name", flat=True))


@strawberry_django.type(NetGroup, name="NetGroup")
class NetGroupNode(relay.Node):
    @classmethod
    def resolve_id(cls, root, *, info: Info) -> str:
        return root.name

    name: str
    description: str
    userSelectable: UserSelectable
    hidden: bool

    @strawberry_django.field()
    async def properties(self, info: Info) -> list[str]:
        if await ain_cached_net_properties_or_user_special(
            info.context["request"], "allow_hidden_net_props", "manage_net_groups"
        ):
            return [
                name async for name in self.properties.values_list("name", flat=True)
            ]
        # only visible if net group is default
        return [
            name
            async for name in self.properties.filters(name="default").values_list(
                "name", flat=True
            )
        ]


@strawberry.type()
class SecretgraphConfig(relay.Node):
    @classmethod
    def resolve_id(cls, root, *, info: Info) -> str:
        return getattr(settings, "LAST_CONFIG_RELOAD_ID", "")

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Iterable[str],
        required: bool = False,
    ):
        return [cls() for nid in node_ids]

    @strawberry_django.field()
    @strawberry_django.django_resolver()
    @staticmethod
    def clusterGroups(info: Info) -> list[ClusterGroupNode]:
        # permissions allows to see the hidden global cluster groups
        # allow_hidden: have mod rights,
        #   so the groups are handy for communication
        # manage_cluster_groups: required for correctly updating groups
        if in_cached_net_properties_or_user_special(
            info.context["request"], "allow_hidden", "manage_cluster_groups"
        ):
            return ClusterGroup.objects.all()
        else:
            return ClusterGroup.objects.filter(hidden=False)

    @strawberry_django.field()
    @strawberry_django.django_resolver()
    @staticmethod
    def netGroups(info: Info) -> list[NetGroupNode]:
        # permissions allows to see the nonselectable global net groups
        # allow_hidden: have mod rights,
        #   so the groups are handy for communication
        # manage_net_groups: required for correctly updating groups
        if in_cached_net_properties_or_user_special(
            info.context["request"], "allow_hidden", "manage_net_groups", "manage_user"
        ):
            return NetGroup.objects.all()
        else:
            return NetGroup.objects.filter(hidden=False)

    @strawberry.field()
    @staticmethod
    def hashAlgorithms() -> list[str]:
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    @strawberry.field(description="Maximal results per relay query")
    @staticmethod
    def maxRelayResults() -> int:
        return getattr(settings, "STRAWBERRY_DJANGO_RELAY_MAX_RESULTS", 100)

    @strawberry.field()
    @classmethod
    def canDirectRegister(cls) -> bool:
        if not getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False):
            return False
        if getattr(settings, "SECRETGRAPH_REQUIRE_USER", False):
            return False
        return True

    @strawberry.field()
    @classmethod
    def registerUrl(cls) -> Optional[str]:
        if not getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False):
            return None
        signup_url = getattr(settings, "SIGNUP_URL", None)
        if signup_url:
            try:
                return resolve_url(signup_url)
            except NoReverseMatch:
                return None
        return None

    @strawberry.field()
    @staticmethod
    def loginUrl() -> Optional[str]:
        if not getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False) and not getattr(
            settings, "SECRETGRAPH_REQUIRE_USER", False
        ):
            return None
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            try:
                return resolve_url(login_url)
            except NoReverseMatch:
                pass
        return None

    # @strawberry_django.field
    # @staticmethod
    # def documents() -> (
    #    List[Annotated["ContentNode", strawberry.lazy(".contents")]]
    # ):
    #    return Content.objects.global_documents()
