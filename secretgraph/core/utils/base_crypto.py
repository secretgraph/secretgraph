import asyncio
import copy
import hashlib
from abc import ABC, abstractmethod
from base64 import b64decode, b64encode
from collections.abc import Callable
from dataclasses import dataclass, field
from inspect import isclass
from os import urandom
from typing import Any, Iterable, Literal, NoReturn, Optional, TypeVar

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
        if isclass(entry):
            initialized = entry()
        else:
            initialized = entry
        for variant in variants:
            targetDict[variant] = initialized
        return entry

    if entry is not None:
        return wrapper(entry)
    return wrapper


@dataclass(frozen=True, kw_only=True)
class DeriveResult:
    data: bytes
    params: ParamsType = field(default_factory=dict)


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


@dataclass(frozen=True, kw_only=True)
class Hasher:
    update: Callable[[bytes], NoReturn]
    finalize: Callable[[], bytes]


class DeriveAlgorithm(ABC):
    serializedName: str
    type: Literal["hash"] | Literal["derive"]

    @abstractmethod
    async def derive(
        self, data: bytes | Iterable[bytes], params: Optional[ParamsType] = None
    ) -> CryptoResult:
        pass

    async def serialize(self, result: DeriveResult) -> str:
        return b64encode(result.data).decode()

    async def deserialize(
        self, inp: str, params: Optional[ParamsType] = None
    ) -> DeserializeDeriveResult:
        return DeserializeDeriveResult(data=b64decode(inp), params=params or {})


class EncryptionAlgorithm(ABC):
    serializedName: str
    type: Literal["asymmetric"] | Literal["symmetric"]

    @abstractmethod
    async def encrypt(
        self, key: KeyType, data: bytes, params: ParamsType
    ) -> CryptoResult:
        pass

    async def encryptor(self, key: KeyType, params: ParamsType):
        raise NotImplementedError()

    @abstractmethod
    async def decrypt(
        self, key: KeyType, data: bytes, params: ParamsType
    ) -> CryptoResult:
        pass

    async def decryptor(self, key: KeyType, params: ParamsType) -> CryptoResult:
        raise NotImplementedError()

    @abstractmethod
    def toHashableKey(self, key: KeyType, raw: bool) -> bytes | Any:
        pass

    @abstractmethod
    async def generateKey(self, params: ParamsType) -> KeyType:
        pass

    async def serializeParams(self, result: CryptoResult) -> str:
        return ""

    async def deserialize(self, data: str, params: ParamsType) -> DeserializeResult:
        return DeserializeResult(data=b64decode(data), params=params or {})


class SignatureAlgorithm(ABC):
    serializedName: str

    @abstractmethod
    async def sign(self, key: KeyType, inp: bytes, prehashed: bool = False) -> str:
        pass

    @abstractmethod
    async def verify(
        self, key: KeyType, signature: str, inp: bytes, prehashed: bool = False
    ) -> bool:
        pass

    async def getHasher(self) -> Hasher:
        raise NotImplementedError()

    @abstractmethod
    def toHashableKey(self, key: KeyType, raw: bool) -> bytes | Any:
        pass

    @abstractmethod
    async def generateKey(self, params: ParamsType) -> KeyType:
        pass


mapDeriveAlgorithms: dict[str, DeriveAlgorithm] = {}
mapEncryptionAlgorithms: dict[str, EncryptionAlgorithm] = {}
mapSignatureAlgorithms: dict[str, SignatureAlgorithm] = {}


@addWithVariants(mapDeriveAlgorithms, ["sha512"])
class SHA512Algo(DeriveAlgorithm):
    type = "hash"
    serializedName = "sha512"

    def _execute(self, data: bytes | Iterable[bytes]):
        hashCtx = hashlib.new(self.serializedName)
        if isinstance(data, bytes):
            hashCtx.update(data)
        else:
            for chunk in data:
                hashCtx.update(chunk)
        return hashCtx.digest()

    async def execute(self, data: bytes | Iterable[bytes]):
        return await asyncio.get_event_loop().run_in_executor(None, self._execute, data)

    async def derive(self, inp: bytes | Iterable[bytes], params=None) -> CryptoResult:
        return DeriveResult(data=await self.execute(inp), params={})

    async def serialize(self, result: CryptoResult) -> str:
        return b64encode(result.data).decode()


@addWithVariants(mapDeriveAlgorithms, ["sha256"])
class SHA256Algo(SHA512Algo):
    serializedName = "sha256"


@addWithVariants(mapDeriveAlgorithms, ["PBKDF2-sha512"])
class PBKDF2sha512(DeriveAlgorithm):
    type = "derive"
    serializedName = "PBKDF2-sha512"

    def _execute(self, iterations, salt, data):
        if not isinstance(data, bytes):
            data = b"".join(data)
        return hashlib.pbkdf2_hmac(
            self.serializedName.split("-")[1],
            data,
            iterations=iterations,
            salt=salt,
            dklen=32,
        ).digest()

    async def execute(self, iterations, salt, data):
        return await asyncio.get_event_loop().run_in_executor(
            None, self._execute, iterations, salt, data
        )

    async def derive(self, inp: bytes, params=None) -> CryptoResult:
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
            data=await self.execute(params["iterations"], params["salt"], inp),
            params=params,
        )

    async def deserialize(self, inp: str, params=None):
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

    async def serialize(self, result):
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

    async def encrypt(self, key, data, params=None):
        # to publicKey
        key = await self.toHashableKey(key, raw=True)
        hashalgo = self.serializedName.split("-")[1].upper()
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

    async def toHashableKey(self, key, raw):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            try:
                key = serialization.load_der_public_key(key)
            except Exception:
                key = serialization.load_der_private_key(key, None)
        if hasattr(key, "public_key"):
            key = key.public_key()
        if raw:
            return key
        return key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

    async def decrypt(self, key, data, params=None):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_private_key(key, None)
        hashalgo = self.serializedName.split("-")[1].upper()
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
                encryption_algorithm=serialization.NoEncryption(),
            ),
        )

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
                encryption_algorithm=serialization.NoEncryption(),
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

    async def encrypt(self, key, data, params=None):
        if not params:
            params = {}
        else:
            params = copy.copy(params)
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = AESGCM(key)
        if not params.get("nonce"):
            params["nonce"] = urandom(13)
        if isinstance(params["nonce"], str):
            params["nonce"] = b64decode(params["nonce"])
        return CryptoResult(
            data=key.encrypt(params["nonce"], data, None), params=params, key=key._key
        )

    async def encryptor(self, key, params):
        params = copy.copy(params)
        if isinstance(params["nonce"], str):
            params["nonce"] = b64decode(params["nonce"])
        if isinstance(key, str):
            key = b64decode(key)
        return Cipher(
            algorithms.AES(key),
            modes.GCM(params["nonce"]),
        ).encryptor()

    async def decrypt(self, key, data, params):
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

    async def decryptor(self, key, params):
        params = copy.copy(params)
        if isinstance(params["nonce"], str):
            params["nonce"] = b64decode(params["nonce"])
        if isinstance(key, str):
            key = b64decode(key)
        return Cipher(
            algorithms.AES(key),
            modes.GCM(params["nonce"]),
        ).decryptor()

    async def serializeParams(self, params):
        return b64encode(params["nonce"]).decode()

    async def toHashableKey(self, key: KeyType, raw):
        # already strengthed
        if len(key) >= 50:
            return key
        if len(key) != 32:
            raise ValueError("invalid key length for hashing")
        return urandom(18) + key

    async def generateKey(self, params=None):
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
    toHashableKey = OEAPsha512.toHashableKey

    async def sign(self, key, data, prehashed=False):
        if isinstance(key, str):
            key = b64decode(key)
        if isinstance(key, bytes):
            key = serialization.load_der_private_key(key, None)
        hashalgo = self.serializedName.split("-")[1].upper()
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

    async def getHasher(self):
        hashalgo = self.serializedName.split("-")[1].upper()
        hashalgo = getattr(hashes, hashalgo)()
        hashCtx = Hash(hashalgo)
        return Hasher(update=hashCtx.update, finalize=hashCtx.finalize)

    async def verify(self, key, signature, data, prehashed=False):
        key = await self.toHashableKey(key, raw=True)
        if isinstance(signature, str):
            signature = b64decode(signature)
        if isinstance(data, str):
            data = b64decode(data)
        hashalgo = self.serializedName.split("-")[1].upper()
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
