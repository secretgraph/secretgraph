from typing import TYPE_CHECKING, Annotated, Optional, List, Iterable
from django.urls import NoReverseMatch
from strawberry.types import Info
from strawberry_django_plus import relay, gql
from django.conf import settings
from django.shortcuts import resolve_url

from ...models import (
    Content,
    GlobalGroup,
)

if TYPE_CHECKING:
    from .contents import ContentNode


@gql.django.type(Content, name="InjectedKey")
class InjectedKeyNode:
    link: str
    contentHash: str

    id_attr = "name"

    @classmethod
    def get_queryset(cls, queryset, info) -> list[Content]:
        return queryset.filter(type="PublicKey", injectedFor__isnull=False)


@gql.django.type(GlobalGroup, name="GlobalGroup")
class GlobalGroupNode(relay.Node):
    name: str
    description: str
    hidden: bool
    matchUserGroup: str
    injectedKeys: List[InjectedKeyNode]

    id_attr = "name"

    @gql.field()
    def properties(self) -> list[str]:
        return self.properties.values_list("name", flat=True)


@gql.type()
class SecretgraphConfig(relay.Node):
    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        return getattr(settings, "LAST_CONFIG_RELOAD_ID", "")

    @classmethod
    def resolve_node(
        cls,
        *,
        info: Optional[Info] = None,
        node_id: str,
        required: bool = False,
    ) -> "SecretgraphConfig":
        return cls()

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Optional[Info] = None,
        node_ids: Optional[Iterable[str]] = None,
    ) -> None:
        return [cls()]

    @gql.django.field
    @staticmethod
    def groups() -> List[GlobalGroupNode]:
        return GlobalGroup.objects.all()

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
