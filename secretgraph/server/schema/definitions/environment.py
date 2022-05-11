from __future__ import annotations

from typing import Optional, List, Iterable
import strawberry
from strawberry.types import Info
from strawberry_django_plus import relay, gql
from django.conf import settings
from django.shortcuts import resolve_url

from ...models import (
    Content,
    GlobalGroup,
    GlobalGroupProperty,
)


# why?: scalars cannot be used in Unions


@strawberry.scalar
class RegisterUrl:
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


@gql.django.type(Content, name="InjectedKey")
class InjectedKeyNode(relay.Node):

    link: str

    @gql.django.field(only=["contentHash"])
    def hash(self) -> str:
        return self.contentHash

    @classmethod
    def resolve_id(cls, root, *, info: Optional[Info] = None) -> str:
        return root.flexid

    def get_queryset(self, queryset, info):
        return queryset.filter(type="PublicKey", injected_for__isnull=False)

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Optional[Info] = None,
        required: bool = False,
    ) -> Optional[InjectedKeyNode]:
        query = Content.objects.filter(
            type="PublicKey", injected_for__isnull=False, flexid=node_id
        )
        if required:
            return query.get()
        else:
            return query.first()

    @classmethod
    def resolve_nodes(
        cls,
        *,
        info: Optional[Info] = None,
        node_ids: Optional[Iterable[str]] = None,
    ) -> None:
        raise NotImplementedError


@gql.django.type(GlobalGroupProperty, name="GlobalGroupProperty")
class GlobalGroupPropertyNode(relay.Node):
    name: str
    description: str


@gql.django.type(GlobalGroup, name="GlobalGroup")
class GlobalGroupNode(relay.Node):

    name: str
    description: str
    hidden: bool
    matchUserGroup: str
    injectedKeys: List[InjectedKeyNode]

    @gql.django.field(only=["properties"])
    def properties(self) -> List[GlobalGroupPropertyNode]:
        return self.properties


@gql.type()
class SecretgraphConfig(relay.Node):
    groups: List[GlobalGroupNode] = gql.django.field(
        default_factory=GlobalGroup.objects.all
    )

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
        raise NotImplementedError

    @strawberry.field
    @staticmethod
    def hashAlgorithms() -> List[str]:
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    @strawberry.field
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

    @strawberry.field
    @staticmethod
    def loginUrl() -> Optional[str]:
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            return resolve_url(login_url)
        return None
