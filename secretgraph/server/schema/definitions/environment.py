from __future__ import annotations

from typing import Optional, List, Iterable
from strawberry.types import Info
from strawberry_django_plus import relay, gql
from django.conf import settings
from django.shortcuts import resolve_url

from ...models import (
    Content,
    GlobalGroup,
)


# why?: scalars cannot be used in Unions


@gql.scalar
class RegisterUrl:
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


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
    @staticmethod
    def registerUrl() -> RegisterUrl:
        if getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False) is not True:
            return False
        signup_url = getattr(settings, "SIGNUP_URL", None)
        if (
            getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
            and not signup_url
        ):
            return False
        if signup_url:
            return resolve_url(signup_url)
        return True

    @gql.field()
    @staticmethod
    def loginUrl() -> Optional[str]:
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            return resolve_url(login_url)
        return None
