from typing import Literal, Any, Protocol, runtime_checkable

from cryptography.hazmat.primitives import serialization

Scope = Literal["manage", "create", "delete", "update", "push", "view"]
ContentState = Literal["required", "trusted", "public", "internal", "draft"]


class NamedHash(type):
    def __instancecheck__(self, __instance: Any) -> bool:
        return isinstance(__instance, str) and ":" in __instance


@runtime_checkable
class PrivateCryptoKey(Protocol):
    def public_key(self) -> Any:
        pass


@runtime_checkable
class PublicCryptoKey(Protocol):
    def public_bytes(
        self,
        encoding: serialization.Encoding,
        format: serialization.PublicFormat,
    ) -> bytes:
        pass


Hash = str
Action = str
