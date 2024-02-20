import asyncio
import base64
from typing import Iterable, Optional

import argon2
from cryptography.hazmat.primitives import serialization

from .. import constants
from ..typings import PrivateCryptoKey, PublicCryptoKey
from .crypto import deriveString, findWorkingAlgorithms, mapDeriveAlgorithms


class DuplicateSaltError(ValueError):
    pass


class MissingSaltError(ValueError):
    pass


async def hashObject(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    hashAlgorithm: str,
) -> str:
    if isinstance(inp, str):
        inp = base64.b64decode(inp)
    if hasattr(inp, "public_key"):
        inp = inp.public_key()
    if hasattr(inp, "public_bytes"):
        inp = inp.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    return await deriveString(inp, algorithm=hashAlgorithm)


async def hashObjectContentHash(
    obj: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    domain: str,
    hashAlgorithm: str,
) -> str:
    return "%s:%s" % (domain, await hashObject(obj, hashAlgorithm))


async def sortedHash(inp: Iterable[str], hashAlgorithm: str) -> str:
    obj = map(lambda x: x.encode("utf8"), sorted(inp))
    return await hashObject(obj, hashAlgorithm)


def generateArgon2RegistrySalt(
    parameters: argon2.Parameters = argon2.profiles.RFC_9106_LOW_MEMORY,
    salt: Optional[bytes] = None,
) -> str:
    return argon2.PasswordHasher.from_parameters(parameters).hash(
        b"secretgraph", salt=salt
    )


def extract_parameters_and_salt(argon2_hash: str):
    # extract the salt, the last parameter is the pw which is set to "secretgraph"
    salt = argon2_hash.rsplit("$", 2)[-2].encode("ascii")
    # = are stripped, readd them
    salt = b"%b%b" % (salt, b"=" * (3 - ((len(salt) + 3) % 4)))
    return argon2.extract_parameters(argon2_hash), base64.b64decode(salt)


def sortedRegistryHashRaw(inp: Iterable[str], url: str) -> str:
    salt = None
    parameters = None
    obja = []
    urlb = base64.b64encode(url.encode("utf8").rstrip(b"&?")).rstrip(b"=")
    for x in inp:
        obja.append(b"%b%b" % (urlb, x.encode("utf8")))
        if x.startswith("salt="):
            argon2_hash = x.split("=", 1)[1]
            ph = argon2.PasswordHasher()
            try:
                ph.verify(argon2_hash, b"secretgraph")
            except Exception:
                continue
            if salt:
                raise DuplicateSaltError("duplicate valid salt")
            parameters, salt = extract_parameters_and_salt(argon2_hash)

    if not salt or not parameters:
        raise MissingSaltError("missing salt")
    obj = b"".join(sorted(obja))
    return "argon2:%s" % argon2.PasswordHasher.from_parameters(parameters).hash(
        obj, salt=salt
    )


def sortedRegistryHash(inp: Iterable[str], url: str, domain: str) -> str:
    return f"{domain}:{sortedRegistryHashRaw(inp, url)}"


async def hashTagsContentHash(
    inp: Iterable[str],
    domain: str,
    hashAlgorithm: constants.HashNameItem | str,
) -> str:
    return "%s:%s" % (domain, await sortedHash(inp, hashAlgorithm))


async def calculateHashesForHashAlgorithms(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    hashAlgorithms: Iterable[str],
) -> list[str]:
    if isinstance(inp, str):
        inp = base64.b64decode(inp)
    if hasattr(inp, "public_key"):
        inp = inp.public_key()
    if hasattr(inp, "public_bytes"):
        inp = inp.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    hashes = []
    for hashAlgorithm in hashAlgorithms:
        if isinstance(hashAlgorithm, str):
            hashAlgorithm = mapDeriveAlgorithms[hashAlgorithm]
        hashes.append(
            asyncio.ensure_future(
                deriveString(inp, algorithm=hashAlgorithm.serializedName)
            )
        )
    return await asyncio.gather(*hashes)


async def calculateHashes(
    inp, hashAlgorithms: Iterable[str], failhard=False
) -> list[str]:
    hashAlgorithms = findWorkingAlgorithms(hashAlgorithms, "hash", failhard=failhard)
    assert len(hashAlgorithms) > 0, "no working hash algorithms found"
    return await calculateHashesForHashAlgorithms(inp, hashAlgorithms)
