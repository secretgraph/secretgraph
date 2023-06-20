from typing import TYPE_CHECKING, Annotated, Iterable, List, Optional

from django.conf import settings
from django.shortcuts import resolve_url
from django.urls import NoReverseMatch
from strawberry import relay
from strawberry.types import Info
from strawberry_django_plus import gql

from ...models import ClusterGroup, Content
from ...utils.auth import get_cached_net_properties

if TYPE_CHECKING:
    from .contents import ContentNode


@gql.django.type(Content, name="InjectedKey")
class InjectedKeyNode:
    link: str
    contentHash: str

    @classmethod
    def get_queryset(cls, queryset, info) -> list[Content]:
        return queryset.filter(type="PublicKey", injectedFor__isnull=False)


@gql.django.type(ClusterGroup, name="ClusterGroup")
class ClusterGroupNode(relay.Node):
    @classmethod
    def resolve_id(cls, root, *, info: Info) -> str:
        return root.name

    name: str
    description: str
    hidden: bool
    injectedKeys: List[InjectedKeyNode]

    @gql.field()
    @gql.django.django_resolver
    def properties(self) -> list[str]:
        return self.properties.values_list("name", flat=True)


@gql.type()
class SecretgraphConfig(relay.Node):
    # we cannot define Node classes without NodeID yet
    stub: relay.NodeID[str]

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
    ) -> None:
        return [cls()]

    @gql.django.field
    @staticmethod
    def clusterGroups(info: Info) -> List[ClusterGroupNode]:
        # permissions allows to see the hidden global groups
        # allow_hidden: have mod rights,
        #   so the groups are handy for communication
        # manage_groups: required for correctly updating groups
        props = get_cached_net_properties(info.context["request"])
        if "allow_hidden" in props or "manage_groups" in props:
            return ClusterGroup.objects.all()
        else:
            return ClusterGroup.objects.filter(hidden=False)

    @gql.field()
    @staticmethod
    def hashAlgorithms() -> List[str]:
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    @gql.field(description="Maximal results per relay query")
    @staticmethod
    def maxRelayResults() -> int:
        return getattr(settings, "STRAWBERRY_DJANGO_RELAY_MAX_RESULTS", 100)

    @gql.field()
    @classmethod
    def canDirectRegister(cls) -> bool:
        if not getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False):
            return False
        if getattr(settings, "SECRETGRAPH_REQUIRE_USER", False):
            return False
        return True

    @gql.field()
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

    @gql.field()
    @staticmethod
    def loginUrl() -> Optional[str]:
        if not getattr(
            settings, "SECRETGRAPH_ALLOW_REGISTER", False
        ) and not getattr(settings, "SECRETGRAPH_REQUIRE_USER", False):
            return None
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            try:
                return resolve_url(login_url)
            except NoReverseMatch:
                pass
        return None

    @staticmethod
    def documents() -> List[Annotated["ContentNode", gql.lazy(".contents")]]:
        return Content.objects.global_documents()
