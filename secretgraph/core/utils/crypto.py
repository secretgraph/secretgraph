from base64 import b64decode, b64encode
from collections.abc import Awaitable
from dataclasses import dataclass
from inspect import isawaitable
from logging import getLogger
from typing import Iterable, Literal, TypeVar

from ..exceptions import UnknownAlgorithm
from .base_crypto import (
    CryptoResult,
    DeriveResult,
    DeserializeResult,
    KeyResult,
    KeyType,
    ParamsType,
    mapDeriveAlgorithms,
    mapEncryptionAlgorithms,
    mapSignatureAlgorithms,
)

logger = getLogger(__name__)

DataInputType = TypeVar(
    "DataInputType", str, bytes, memoryview, Awaitable[str | bytes | memoryview]
)
KeyInputType = TypeVar(
    "KeyInputType", str, bytes, memoryview, Awaitable[str | bytes | memoryview]
)
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
class FullDeriveResult(DeriveResult):
    serializedName: str
    serialized: str


@dataclass(frozen=True, kw_only=True)
class FullCryptoResult(CryptoResult):
    serializedName: str


@dataclass(frozen=True, kw_only=True)
class FullDeserializeResult(DeserializeResult):
    serializedName: str


@dataclass(frozen=True, kw_only=True)
class FullKeyResult(KeyResult):
    serializedName: str


@dataclass(frozen=True, kw_only=True)
class FullHashKeyResult(FullDeriveResult):
    key: bytes


async def data_helper(data: DataInputType) -> bytes | str:
    if isawaitable(data):
        data = await data
    if isinstance(data, memoryview):
        data = data.tobytes()
    return data


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
    return list(algos.keys())


async def derive(
    data: DataInputType, params: ParamsInputType = None, algorithm: str = ""
) -> FullDeriveResult:
    data = await data_helper(data)
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
    assert isinstance(data, (bytes, Iterable))
    result = await entry.derive(data, params)
    return FullDeriveResult(
        data=result.data,
        params=result.params,
        serializedName=entry.serializedName,
        serialized=f"{entry.serializedName}:{await entry.serialize(result)}",
    )


async def deserializeDerivedString(
    inp: Awaitable[str] | str, params: ParamsInputType = None, algorithm: str = ""
) -> FullDeriveResult:
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
    return FullDeriveResult(
        params=result.params,
        data=result.data,
        serializedName=entry.serializedName,
    )


async def deriveString(
    data: DataInputType, params: ParamsInputType = None, algorithm: str = ""
) -> str:
    result = await derive(data, params=params, algorithm=algorithm)
    return result.serialized


async def serializeDerive(inp: FullDeriveResult | Awaitable[FullDeriveResult]) -> str:
    if isawaitable(inp):
        inp = await inp
    entry = mapDeriveAlgorithms[inp.serializedName]
    return f"{entry.serializedName}:{await entry.serialize(inp)}"


async def generateEncryptionKey(
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


async def generateSignKey(
    algorithm: str = "", params: ParamsInputType = None
) -> FullKeyResult:
    entry = mapSignatureAlgorithms.get(algorithm)
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
    data = await data_helper(data)
    if isinstance(data, str):
        data = b64decode(data)
    key = await data_helper(key)
    if isinstance(key, str):
        key = b64decode(key)
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
    serializedParams = await entry.serializeParams(result.params)
    if serializedParams:
        serializedParams = f"{serializedParams}:"
    return f"{entry.serializedName}:{serializedParams}{b64encode(result.data).decode()}"


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
) -> FullDeserializeResult:
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
    return FullDeserializeResult(
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
    data = await data_helper(data)
    if isinstance(data, str):
        data = b64decode(data)
    key = await data_helper(key)
    if isinstance(key, str):
        key = b64decode(key)
    entry = mapEncryptionAlgorithms.get(algorithm)
    if not entry:
        raise UnknownAlgorithm("invalid algorithm: " + algorithm)
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
    key = await data_helper(key)
    if isinstance(key, str):
        key = b64decode(key)
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
    key = await data_helper(key)
    if isinstance(key, str):
        key = b64decode(key)
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
    data = await data_helper(data)
    if isinstance(data, str):
        data = b64decode(data)
    key = await data_helper(key)
    if isinstance(key, str):
        key = b64decode(key)

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
    data = await data_helper(data)
    if isinstance(data, str):
        data = b64decode(data)
    key = await data_helper(key)
    if isinstance(key, str):
        key = b64decode(key)

    return entry.verify(key, signature, data, prehashed=prehashed)


async def toHashableKey(
    key: KeyType | Awaitable[KeyType],
    algorithm: str,
    sign: bool | None = None,
    raiseOnSymmetric=False,
) -> FullKeyResult:
    keyEntry = None
    if sign is None or sign:
        keyEntry = mapSignatureAlgorithms.get(algorithm)
    if not keyEntry and not sign:
        keyEntry = mapEncryptionAlgorithms.get(algorithm)
        if keyEntry.type == "symmetric":
            raise ValueError("not an asymmetric algorithm")
    if not keyEntry:
        raise UnknownAlgorithm("invalid key algorithm: " + algorithm)
    key = await data_helper(key)
    if isinstance(key, str):
        key = b64decode(key)
    hashableKey = await keyEntry.toHashableKey(key)
    return FullKeyResult(key=hashableKey, serializedName=keyEntry.serializedName)


async def toPublicKey(
    key: KeyType | Awaitable[KeyType],
    algorithm: str,
    sign: bool | None = None,
) -> FullKeyResult:
    return await toHashableKey(
        key, algorithm=algorithm, sign=sign, raiseOnSymmetric=True
    )


async def hashKey(
    key: KeyType | Awaitable[KeyType],
    keyAlgorithm: str,
    deriveAlgorithm: str,
    sign: bool | None = None,
    deriveParams: ParamsType = None,
) -> FullHashKeyResult:
    result1 = await toHashableKey(key, algorithm=keyAlgorithm, sign=sign)
    result2 = await derive(
        result1.key,
        algorithm=deriveAlgorithm,
        params=deriveParams,
    )
    return FullHashKeyResult(
        data=result2.data,
        params=result2.params,
        serializedName=result2.serializedName,
        serialized=result2.serialized,
        key=result1.key,
    )
