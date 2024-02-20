from base64 import b64decode, b64encode
from collections.abc import Awaitable
from dataclasses import dataclass
from inspect import isawaitable
from logging import getLogger
from typing import Iterable, Literal, TypeVar

from ..exceptions import UnknownAlgorithm
from .base_crypto import (
    CryptoResult,
    KeyResult,
    KeyType,
    OptionalCryptoResult,
    ParamsType,
    mapDeriveAlgorithms,
    mapEncryptionAlgorithms,
    mapSignatureAlgorithms,
)

logger = getLogger(__name__)

DataInputType = TypeVar("DataInputType", str, bytes, Awaitable[str | bytes])
KeyInputType = TypeVar("KeyInputType", KeyType, Awaitable[KeyType])
ParamsInputType = TypeVar(
    "ParamsInputType",
    ParamsType,
    None,
)
ParamsInputType2 = TypeVar(
    "ParamsInputType2",
    ParamsInputType,
    str,
)


@dataclass(frozen=True, kw_only=True)
class FullCryptoResult(CryptoResult):
    serializedName: str


@dataclass(frozen=True, kw_only=True)
class FullOptionalCryptoResult(OptionalCryptoResult):
    serializedName: str


@dataclass(frozen=True, kw_only=True)
class FullKeyResult(KeyResult):
    serializedName: str


def findWorkingAlgorithms(
    algorithms: Iterable[str],
    domain: Literal["hash"]
    | Literal["derive"]
    | Literal["symmetric"]
    | Literal["asymmetric"]
    | Literal["signature"]
    | Literal["all"],
    failhard=False,
) -> list[str]:
    # only dicts are insertion order stable
    algos = {}
    for algo in algorithms:
        found = None
        if (
            (domain == "all" or domain == "hash")
            and algo in mapDeriveAlgorithms
            and mapDeriveAlgorithms[algo].type == "hash"
        ):
            found = mapDeriveAlgorithms[algo].serializedName
        elif (
            (domain == "all" or domain == "derive")
            and algo in mapDeriveAlgorithms
            and mapDeriveAlgorithms[algo].type == "derive"
        ):
            found = mapDeriveAlgorithms[algo].serializedName
        elif (
            (domain == "all" or domain == "asymmetric")
            and algo in mapEncryptionAlgorithms
            and mapEncryptionAlgorithms[algo].type == "asymmetric"
        ):
            found = mapEncryptionAlgorithms[algo].serializedName
        elif (
            (domain == "all" or domain == "symmetric")
            and algo in mapEncryptionAlgorithms
            and mapEncryptionAlgorithms[algo].type == "symmetric"
        ):
            found = mapEncryptionAlgorithms[algo].serializedName
        elif (domain == "all" or domain == "signature") and mapSignatureAlgorithms[
            algo
        ]:
            found = mapSignatureAlgorithms[algo].serializedName
        elif failhard:
            raise UnknownAlgorithm("Unknown algorithm: " + algo)
        if found and found not in algos:
            algos[found] = True
    return algos.keys()


async def derive(
    data: DataInputType, params: ParamsInputType = None, algorithm: str = ""
) -> FullCryptoResult:
    if isawaitable(data):
        data = await data
    if not algorithm and isinstance(data, str):
        splitted = data.split(":", 1)
        algorithm = splitted[0]
        data = splitted[1]

    entry = mapDeriveAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)

    if isinstance(data, str):
        result = await entry.deserialize(data, params)
        data = result.data
        params = result.params
    assert isinstance(data, bytes)
    result = await entry.derive(data, params)
    return FullCryptoResult(
        data=result.data, params=result.params, serializedName=entry.serializedName
    )


async def deserializeDerivedString(
    inp: Awaitable[str] | str, params: ParamsInputType = None, algorithm: str = ""
) -> FullCryptoResult:
    if isawaitable(inp):
        inp = await inp
    if not algorithm:
        splitted = inp.split(":", 1)
        algorithm = splitted[0]
        inp = splitted[1]
    entry = mapDeriveAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("unknown algorithm")

    result = await entry.deserialize(inp, params)
    return FullCryptoResult(
        params=result.params,
        data=result.data,
        serializedName=entry.serializedName,
    )


async def deriveString(
    data: DataInputType, params: ParamsInputType = None, algorithm: str = ""
) -> str:
    if isawaitable(data):
        data = await data
    if isinstance(data, str):
        data = await b64decode(data)
    result = await derive(data, params=params, algorithm=algorithm)
    entry = mapDeriveAlgorithms.get(result.serializedName)
    return f"{entry.serializedName}:{await entry.serialize(result)}"


async def serializeDerive(inp: FullCryptoResult | Awaitable[CryptoResult]) -> str:
    if isawaitable(inp):
        inp = await inp
    entry = mapDeriveAlgorithms[inp.serializedName]
    return f"{entry.serializedName}:{await entry.serialize(inp)}"


async def generateKey(
    algorithm: str = "", params: ParamsInputType = None
) -> FullKeyResult:
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    if isawaitable(params):
        params = await params
    result = await entry.generateKey(params)
    return FullKeyResult(
        key=result.key, params=result.params, serializedName=entry.serializedName
    )


async def encrypt(
    key: KeyInputType,
    data: DataInputType,
    params: ParamsInputType = None,
    algorithm: str = "",
) -> FullCryptoResult:
    if isawaitable(data):
        data = await data
    if isawaitable(key):
        key = await key
    if isinstance(data, str):
        data = b64decode(data)
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    assert isinstance(data, bytes)
    result = await entry.encrypt(key, data, params)
    return FullCryptoResult(
        data=result.data,
        key=result.key,
        params=result.params,
        serializedName=entry.serializedName,
    )


async def encryptString(
    key: KeyboardInterrupt,
    data: DataInputType,
    params: ParamsInputType = None,
    algorithm: str = "",
) -> str:
    result = await encrypt(key, data, params=params, algorithm=algorithm)
    entry = mapEncryptionAlgorithms[result.serializedName]
    return f"{entry.serializedName}:{await entry.serializeParams(result.params)}:{b64encode(result.data).decode()}"


async def serializeEncryptionParams(params: ParamsInputType, algorithm: str) -> str:
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    if entry.serializeParams:
        return f"{entry.serializedName}:{await entry.serializeParams(params)}"
    else:
        return f"{entry.serializedName}:"


async def deserializeEncryptedString(
    data: Awaitable[str] | str, params: ParamsInputType = None, algorithm: str = ""
) -> FullOptionalCryptoResult:
    if isawaitable(data):
        data = await data
    if not algorithm:
        splitted = data.split(":", 1)
        algorithm = splitted[0]
        data = splitted[1]
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("unknown algorithm")

    result = await entry.deserialize(data, params)
    return FullOptionalCryptoResult(
        params=result.params,
        data=result.data,
        serializedName=entry.serializedName,
    )


async def decrypt(
    key: KeyInputType,
    data: DataInputType,
    algorithm: str = "",
    params: ParamsInputType2 = None,
) -> FullCryptoResult:
    if not algorithm and isinstance(params, str):
        result = await deserializeEncryptedString(params)
        algorithm = result.serializedName
        params = result.params
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    if isawaitable(key):
        key = await key
    if isawaitable(data):
        data = await data
    if isinstance(data, str):
        data = b64decode(data)

    assert isinstance(data, bytes)
    result = await entry.decrypt(key, data, params)
    return FullCryptoResult(
        data=result.data,
        params=result.params,
        key=result.key,
        serializedName=entry.serializedName,
    )


async def getDecryptor(
    key: KeyInputType,
    algorithm: str = "",
    params: ParamsInputType2 = None,
):
    if not algorithm and isinstance(params, str):
        result = await deserializeEncryptedString(params)
        algorithm = result.serializedName
        params = result.params
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    if isawaitable(key):
        key = await key
    return await entry.decryptor(key, params)


async def getEncryptor(
    key: KeyInputType,
    algorithm: str = "",
    params: ParamsInputType2 = None,
) -> FullCryptoResult:
    if not algorithm and isinstance(params, str):
        result = await deserializeEncryptedString(params)
        algorithm = result.serializedName
        params = result.params
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    if isawaitable(key):
        key = await key
    return await entry.encryptor(key, params)


async def decryptString(
    key: KeyInputType,
    data: str | Awaitable[str],
    params: ParamsInputType = None,
    algorithm: str = "",
) -> FullCryptoResult:
    result = await deserializeEncryptedString(data, params=params, algorithm=algorithm)
    return await decrypt(key, data, algorithm=result.serializedName, params=params)


async def sign(
    key: KeyInputType, data: DataInputType, algorithm: str, prehashed=False
) -> str:
    entry = mapSignatureAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    if isawaitable(key):
        key = await key
    if isawaitable(data):
        data = await data
    if isinstance(data, str):
        data = b64decode(data)

    try:
        return f"{entry.serializedName}:${await entry.sign(key, data, prehashed=prehashed)}"
    except Exception as exc:
        logger.error("sign parameters: %s, %s", algorithm, key)
        raise exc


async def getSignatureHasher(algorithm: str):
    entry = mapSignatureAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    return entry.getHasher()


async def verify(
    key: KeyType,
    signature: str | Awaitable[str],
    data: DataInputType,
    algorithm: str = "",
    prehashed=False,
) -> bool:
    if isawaitable(signature):
        signature = await signature
    if not algorithm:
        splitted = signature.split(":", 1)
        algorithm = splitted[0]
        signature = splitted[1]
    entry = mapSignatureAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
    if isawaitable(key):
        key = await key
    if isawaitable(data):
        data = await data
    if isinstance(data, str):
        data = b64decode(data)
    return entry.verify(key, signature, data, prehashed=prehashed)
