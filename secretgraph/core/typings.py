from typing import Any, Literal, Protocol, TypedDict, Union, runtime_checkable

from cryptography.hazmat.primitives import serialization

Scope = Literal["admin", "manage", "create", "delete", "update", "push", "view"]
ContentState = Literal[
    "required", "trusted", "public", "protected", "draft", "sensitive"
]


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


class TrustedKeyValue(TypedDict):
    links: list[str]
    note: str
    level: Union[1, 2, 3]
    lastChecked: int


class ConfigTokenValue(TypedDict):
    data: str
    note: str
    system: bool


class ConfigCertificateValue(TypedDict):
    data: str
    type: str
    note: str


ConfigHashesInterface = dict[Hash, list[str]]


class ConfigContentInterface(TypedDict):
    hashes: ConfigHashesInterface
    cluster: str


class ConfigClusterInterface(TypedDict):
    hashes: ConfigHashesInterface


class HostInterface(TypedDict):
    clusters: dict[str, ConfigClusterInterface]
    contents: dict[str, ConfigContentInterface]
    # slot primaries
    primary: dict[str, list[str]]


class ConfigInterface(TypedDict):
    baseUrl: str
    configCluster: str
    certificates: dict[Hash, ConfigCertificateValue]
    tokens: dict[Hash, ConfigTokenValue]
    slots: list[str]
    configLockUrl: str
    configSecurityQuestion: tuple[str, str]
    signWith: dict[str, list[str]]
    hosts: dict[str, HostInterface]
    trustedKeys: dict[str, TrustedKeyValue]
