import copy
import hashlib
from base64 import b64decode, b64encode
from collections.abc import ABC, abstractmethod
from dataclasses import dataclass, field
from os import urandom
from typing import Literal, Optional, TypeVar

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, padding, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

T = TypeVar("T")
KeyType = TypeVar("KeyType")
ParamsType = TypeVar("ParamsType", dict)


def addWithVariants(
    targetDict: dict[str, T], variants: list[str], entry: Optional[T] = None
):
    def wrapper(entry):
        for variant in variants:
            targetDict[variant] = entry
        return entry

    if entry:
        return wrapper(entry)
    return wrapper


@dataclass(frozen=True)
class KeyResult:
    key: KeyType
    params: ParamsType = field(default_factory=dict)


@dataclass(frozen=True)
class CryptoResult:
    data: bytes
    params: ParamsType = field(default_factory=dict)


@dataclass(frozen=True)
class OptionalCryptoResult(CryptoResult):
    data: Optional[bytes] = None


class DeriveAlgorithm(ABC):
    serializedName: str
    type: Literal["hash"] | Literal["derive"]

    @classmethod
    @abstractmethod
    async def derive(
        cls, inp: bytes, params: Optional[ParamsType] = None
    ) -> CryptoResult:
        pass

    @classmethod
    async def serialize(cls, result: CryptoResult) -> str:
        return b64encode(result.data).decode()

    @classmethod
    async def deserialize(
        cls, inp: str, params: Optional[ParamsType] = None
    ) -> CryptoResult:
        return CryptoResult(data=b64decode(inp), params=params)


class EncryptionAlgorithm(ABC):
    serializedName: str
    type: Literal["asymmetric"] | Literal["symmetric"]

    @classmethod
    @abstractmethod
    async def encrypt(
        cls, key: KeyType, inp: bytes, params: ParamsType
    ) -> CryptoResult:
        pass

    @classmethod
    @abstractmethod
    async def decrypt(
        cls, key: KeyType, inp: bytes, params: ParamsType
    ) -> CryptoResult:
        pass

    @classmethod
    @abstractmethod
    async def generateKey(cls, params: ParamsType) -> KeyType:
        pass

    @classmethod
    async def serializeParams(cls, result: CryptoResult) -> str:
        return ""

    @classmethod
    async def deserialize(cls, inp: str, params: ParamsType) -> OptionalCryptoResult:
        return OptionalCryptoResult(data=b64decode(inp), params=params or {})


class SignatureAlgorithm(ABC):
    serializedName: str

    @classmethod
    @abstractmethod
    async def sign(cls, key: KeyType, inp: bytes, prehashed: bool = False) -> str:
        pass

    @classmethod
    @abstractmethod
    async def verify(
        cls, key: KeyType, signature: str, inp: bytes, prehashed: bool = False
    ) -> bool:
        pass

    @classmethod
    @abstractmethod
    async def generateKey(cls, params: ParamsType) -> KeyType:
        pass


mapDeriveAlgorithms: dict[str, DeriveAlgorithm] = {}
mapEncryptionAlgorithms: dict[str, EncryptionAlgorithm] = {}
mapSignatureAlgorithms: dict[str, SignatureAlgorithm] = {}


@addWithVariants(mapDeriveAlgorithms, ["sha512"])
class SHA512Algo(DeriveAlgorithm):
    type = "hash"
    serializedName = "sha512"

    @classmethod
    async def derive(cls, inp: bytes, params=None) -> CryptoResult:
        return CryptoResult(
            data=hashlib.new(cls.serializedName)(inp).digest(), params={}
        )

    @classmethod
    async def serialize(cls, result: CryptoResult) -> str:
        return b64encode(result.data).decode()


@addWithVariants(mapDeriveAlgorithms, ["sha256"])
class SHA256Algo(SHA512Algo):
    serializedName = "sha256"


@addWithVariants(mapDeriveAlgorithms, ["PBKDF2-sha512"])
class PBKDF2sha512(DeriveAlgorithm):
    type = "derive"
    serializedName = "PBKDF2-sha512"

    @classmethod
    async def derive(cls, inp: bytes, params=None) -> CryptoResult:
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        params["iterations"] = int(params.get("iterations", 800000))

        # for AESGCM compatibility cap at 32
        return CryptoResult(
            data=hashlib.pbkdf2_hmac(
                cls.serializedName.split("-")[1],
                inp,
                salt=params["salt"],
                iterations=params["iterations"],
                dklen=32,
            ).digest(),
            params=params,
        )

    @classmethod
    async def serialize(cls, result):
        return f"""{result.params['iterations']},{
            result.params['salt']
        }:${b64encode(result.data).decode()}"""


@addWithVariants(mapDeriveAlgorithms, ["PBKDF2-sha512"])
class PBKDF2sha256(PBKDF2sha512):
    serializedName = "PBKDF2-sha256"


@addWithVariants(mapEncryptionAlgorithms, ["rsa-sha512"])
class OEAPsha512(EncryptionAlgorithm):
    type = "asymmetric"
    serializedName = "rsa-sha512"

    @classmethod
    async def encrypt(cls, key, data, params=None):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_public_key(key)
        elif isinstance(key, rsa.RSAPrivateKey):
            key = key.public_key()
        hashalgo = cls.serializedName.split("-")[1].upper()
        hashalgo = getattr(hashes, hashalgo)()
        return CryptoResult(
            data=key.encrypt(
                data,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashalgo),
                    algorithm=hashalgo,
                    label=None,
                ),
            )
        )

    @classmethod
    async def decrypt(cls, key, data, params=None):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_private_key(key)
        hashalgo = cls.serializedName.split("-")[1].upper()
        hashalgo = getattr(hashes, hashalgo)()
        return CryptoResult(
            data=key.decrypt(
                data,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashalgo),
                    algorithm=hashalgo,
                    label=None,
                ),
            )
        )

    @classmethod
    async def generateKey(cls, params=None):
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        params["bits"] = int(params.get("bits", 4096))
        return KeyResult(
            key=rsa.generate_private_key(
                public_exponent=65537,
                key_size=params["bits"],
            ),
            params=params,
        )


@addWithVariants(mapEncryptionAlgorithms, ["rsa-sha256"])
class OEAPsha256(OEAPsha512):
    serializedName = "rsa-sha256"


@addWithVariants(mapEncryptionAlgorithms, ["AESGCM"])
class AESGCMAlgo(EncryptionAlgorithm):
    type = "symmetric"
    serializedName = "AESGCM"

    @classmethod
    async def encrypt(cls, key, data, params=None):
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = AESGCM(key)
        params["nonce"] = params.get("nonce", urandom(13))
        if isinstance(params["nonce"], str):
            params["nonce"] = b64decode(params["nonce"])
        return CryptoResult(
            data=key.encrypt(params["nonce"], data, None),
            params=params,
        )

    @classmethod
    async def decrypt(cls, key, data, params):
        params = copy.copy(params)
        if isinstance(params["nonce"], str):
            params["nonce"] = b64decode(params["nonce"])
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = AESGCM(key)
        return CryptoResult(
            data=key.decrypt(params["nonce"], data, None),
            params=params,
        )

    @classmethod
    async def serializeParams(params):
        return b64encode(params.nonce).decode()

    @classmethod
    async def generateKey(params=None):
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        params["bits"] = int(params.get("bits", 256))
        if params["bits"] not in {128, 256}:
            raise ValueError("invalid amount of bits")
        return KeyResult(
            key=urandom(params["bits"] // 8),
            params=params,
        )


@addWithVariants(mapSignatureAlgorithms, ["rsa-sha512", "sha512", "SHA-512"])
class RSASignsha512(SignatureAlgorithm):
    serializedName = "rsa-sha512"
    generateKey = OEAPsha512.generateKey

    @classmethod
    async def sign(cls, key, data, prehashed=False):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_private_key(key)
        hashalgo = cls.serializedName.split("-")[1].upper()
        hashalgo = getattr(hashes, hashalgo)()
        if prehashed:
            hash2 = utils.Prehashed(hashalgo)
        else:
            hash2 = hashalgo
        return b64encode(
            key.sign(
                data,
                padding.PSS(
                    mgf=padding.MGF1(hashalgo), salt_length=padding.PSS.MAX_LENGTH
                ),
                hash2,
            )
        ).decode()

    @classmethod
    async def verify(cls, key, signature, data, prehashed=False):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_public_key(key)
        if isinstance(signature, str):
            signature = b64decode(signature)
        if isinstance(data, str):
            data = b64decode(data)
        hashalgo = cls.serializedName.split("-")[1].upper()
        hashalgo = getattr(hashes, hashalgo)()
        if prehashed:
            hash2 = utils.Prehashed(hashalgo)
        else:
            hash2 = hashalgo
        try:
            key.verify(
                signature,
                data,
                padding.PSS(
                    mgf=padding.MGF1(hashalgo), salt_length=padding.PSS.MAX_LENGTH
                ),
                hash2,
            )
            return True
        except InvalidSignature:
            return False


@addWithVariants(mapSignatureAlgorithms, ["rsa-sha256", "sha256", "SHA-256"])
class RSASignsha256(RSASignsha512):
    serializedName = "rsa-sha256"
