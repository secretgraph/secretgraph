from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

T = TypeVar("T")
KeyType = TypeVar("KeyType")
ParamsType = TypeVar("ParamsType")


def addVariants(targetDict: dict[str, T], entry: T, variants: list[str]):
    for variant in variants:
        targetDict[variant] = entry


validHashNames: dict[str, str] = {}
validDeriveNames: dict[str, str] = {}
validSymmetricNames: dict[str, str] = {}
validAsymmetricNames: dict[str, str] = {}


@dataclass(frozen=True)
class CryptoResult:
    data: bytes
    params: Any


@dataclass(frozen=True)
class DeriveAlgorithm:
    derive: Callable[[bytes | str, Any] | [bytes | str], Awaitable[CryptoResult]]
    serialize: Callable[[CryptoResult], str]
    serializedName: str


@dataclass(frozen=True)
class EncryptionAlgorithm:
    encrypt: Callable[
        [KeyType, bytes | str, ParamsType] | [KeyType, bytes | str],
        Awaitable[CryptoResult],
    ]
    decrypt: Callable[
        [KeyType, bytes | str, ParamsType] | [KeyType, bytes | str],
        Awaitable[CryptoResult],
    ]
    serialize: Callable[[CryptoResult], str]
    deserialize: Callable[[str], CryptoResult]
    serializedName: str


@dataclass(frozen=True)
class SignatureAlgorithm:
    sign: Callable[[KeyType, bytes], Awaitable[str]]
    verify: Callable[[KeyType, str, bytes], Awaitable[bool]]
    serializedName: str


mapDeriveAlgorithms: dict[str, DeriveAlgorithm] = {}
mapEncryptionAlgorithms: dict[str, EncryptionAlgorithm] = {}
mapSignatureAlgorithms: dict[str, SignatureAlgorithm] = {}
