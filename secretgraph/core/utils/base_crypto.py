import asyncio
import copy
import hashlib
from abc import ABC, abstractmethod
from base64 import b64decode, b64encode
from dataclasses import dataclass, field
from os import urandom
from typing import Iterable, Literal, Optional, TypeVar

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import Hash

T = TypeVar("T")
KeyType = TypeVar("KeyType", bound=bytes)
ParamsType = TypeVar("ParamsType", bound=dict)


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


@dataclass(frozen=True, kw_only=True)
class DeriveResult:
    data: bytes
    params: ParamsType


@dataclass(frozen=True, kw_only=True)
class CryptoResult(DeriveResult):
    key: bytes


@dataclass(frozen=True, kw_only=True)
class KeyResult:
    key: KeyType
    params: ParamsType = field(default_factory=dict)


@dataclass(frozen=True, kw_only=True)
class DeserializeResult:
    params: ParamsType
    data: Optional[bytes] = None


@dataclass(frozen=True, kw_only=True)
class DeserializeDeriveResult(DeserializeResult):
    data: bytes


class DeriveAlgorithm(ABC):
    serializedName: str
    type: Literal["hash"] | Literal["derive"]

    @classmethod
    @abstractmethod
    async def derive(
        cls, data: bytes | Iterable[bytes], params: Optional[ParamsType] = None
    ) -> CryptoResult:
        pass

    @classmethod
    async def serialize(cls, result: DeriveResult) -> str:
        return b64encode(result.data).decode()

    @classmethod
    async def deserialize(
        cls, inp: str, params: Optional[ParamsType] = None
    ) -> DeserializeDeriveResult:
        return DeserializeDeriveResult(data=b64decode(inp), params=params)


class EncryptionAlgorithm(ABC):
    serializedName: str
    type: Literal["asymmetric"] | Literal["symmetric"]

    @classmethod
    @abstractmethod
    async def encrypt(
        cls, key: KeyType, data: bytes, params: ParamsType
    ) -> CryptoResult:
        pass

    @classmethod
    async def encryptor(cls, key: KeyType, params: ParamsType):
        raise NotImplementedError()

    @classmethod
    @abstractmethod
    async def decrypt(
        cls, key: KeyType, data: bytes, params: ParamsType
    ) -> CryptoResult:
        pass

    @classmethod
    async def decryptor(cls, key: KeyType, params: ParamsType) -> CryptoResult:
        raise NotImplementedError()

    @classmethod
    @abstractmethod
    def toHashableKey(cls, key: KeyType) -> bytes:
        pass

    @classmethod
    @abstractmethod
    async def generateKey(cls, params: ParamsType) -> KeyType:
        pass

    @classmethod
    async def serializeParams(cls, result: CryptoResult) -> str:
        return ""

    @classmethod
    async def deserialize(cls, data: str, params: ParamsType) -> DeserializeResult:
        return DeserializeResult(data=b64decode(data), params=params or {})


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
    async def getHasher(cls):
        raise NotImplementedError()

    @classmethod
    async def finalize(cls) -> bytes:
        raise NotImplementedError()

    @classmethod
    @abstractmethod
    def toHashableKey(cls, key: KeyType) -> bytes:
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
    def _execute(cls, data: bytes | Iterable[bytes]):
        hashCtx = hashlib.new(cls.serializedName)
        if isinstance(data, bytes):
            hashCtx.update(data)
        else:
            for chunk in data:
                hashCtx.update(chunk)
        return hashCtx.digest()

    @classmethod
    async def execute(cls, data: bytes | Iterable[bytes]):
        return await asyncio.get_event_loop().run_in_executor(None, cls._execute, data)

    @classmethod
    async def derive(cls, inp: bytes | Iterable[bytes], params=None) -> CryptoResult:
        return DeriveResult(data=await cls.execute(inp), params={})

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
    def _execute(cls, iterations, salt, data):
        if not isinstance(data, bytes):
            data = b"".join(data)
        return hashlib.pbkdf2_hmac(
            cls.serializedName.split("-")[1],
            data,
            iterations=iterations,
            salt=salt,
            dklen=32,
        ).digest()

    @classmethod
    async def execute(cls, iterations, salt, data):
        return await asyncio.get_event_loop().run_in_executor(
            None, cls._execute, iterations, salt, data
        )

    @classmethod
    async def derive(cls, inp: bytes, params=None) -> CryptoResult:
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        params["iterations"] = int(params.get("iterations", 800000))
        params["salt"] = params.get("salt", None)
        if not params["salt"]:
            params["salt"] = urandom(16)
        if isinstance(params["salt"], str):
            params["salt"] = b64decode(params["salt"])

        # for AESGCM compatibility cap at 32
        return DeriveResult(
            data=await cls.execute(params["iterations"], params["salt"], inp),
            params=params,
        )

    @classmethod
    async def deserialize(cls, inp: str, params=None):
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        splitted = inp.split(":")
        if splitted.length >= 2:
            splitted2 = splitted[0].split(",")
            params["iterations"] = int(splitted2[0])
            if splitted2.length > 2:
                params["salt"] = splitted2[1]

        if not params.get("salt"):
            raise ValueError("no salt provided")
        if isinstance(params["salt"], str):
            params["salt"] = b64decode(params["salt"])
        return DeserializeDeriveResult(data=b64decode(splitted[-1]), params=params)

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
            ),
            key=key.public_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            ),
        )

    @classmethod
    async def toHashableKey(cls, key):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_public_key(key)
        elif isinstance(key, rsa.RSAPrivateKey):
            key = key.public_key()
        if hasattr(key, "public_key"):
            key = key.public_key()
        return key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
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
            ),
            key=key.private_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PrivateFormat.PKCS8,
            ),
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
            ).private_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PrivateFormat.PKCS8,
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
            data=key.encrypt(params["nonce"], data, None), params=params, key=key._key
        )

    @classmethod
    async def encryptor(cls, key, params):
        params = copy.copy(params)
        if isinstance(params["nonce"], str):
            params["nonce"] = b64decode(params["nonce"])
        if isinstance(key, str):
            key = b64decode(key)
        return Cipher(
            algorithms.AES(key),
            modes.GCM(params["nonce"]),
        ).encryptor()

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
            data=key.decrypt(params["nonce"], data, None), params=params, key=key._key
        )

    @classmethod
    async def decryptor(cls, key, params):
        params = copy.copy(params)
        if isinstance(params["nonce"], str):
            params["nonce"] = b64decode(params["nonce"])
        if isinstance(key, str):
            key = b64decode(key)
        return Cipher(
            algorithms.AES(key),
            modes.GCM(params["nonce"]),
        ).decryptor()

    @classmethod
    async def serializeParams(params):
        return b64encode(params.nonce).decode()

    @classmethod
    async def toHashableKey(cls, key: KeyType):
        # already strengthed
        if len(key) >= 50:
            return key
        if len(key) != 32:
            raise ValueError("invalid key length for hashing")
        return urandom(18) + key

    @classmethod
    async def generateKey(params=None):
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        params["bits"] = int(params.get("bits", 256))
        return KeyResult(
            key=AESGCM.generate_key(params["bits"]),
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
    async def getHasher(cls):
        hashalgo = cls.serializedName.split("-")[1].upper()
        hashalgo = getattr(hashes, hashalgo)()
        return Hash(hashalgo)

    @classmethod
    async def finalize(cls, hasher):
        return hasher.finalize()

    @classmethod
    async def toHashableKey(cls, key):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_public_key(key)
        elif isinstance(key, rsa.RSAPrivateKey):
            key = key.public_key()
        if hasattr(key, "public_key"):
            key = key.public_key()
        return key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

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
