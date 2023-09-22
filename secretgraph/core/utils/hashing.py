import base64
from typing import Iterable, Optional

import argon2
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.hashes import Hash

from .. import constants
from ..typings import PrivateCryptoKey, PublicCryptoKey


class DuplicateSaltError(ValueError):
    pass


class MissingSaltError(ValueError):
    pass


def findWorkingHashAlgorithms(
    hashAlgorithms: Iterable[str] | str, failhard: bool = False
) -> list[constants.HashNameItem]:
    working_dict = {}
    if isinstance(hashAlgorithms, str):
        hashAlgorithms = hashAlgorithms.split(",")
    for i in hashAlgorithms:
        foundAlgo = constants.mapHashNames.get(i, None)
        if foundAlgo:
            working_dict[foundAlgo.serializedName] = foundAlgo
        elif failhard:
            raise ValueError("%s hash algorithm not found" % i)

    return list(working_dict.values())


def _hashObject(
    inp: bytes | Iterable[bytes],
    hashAlgorithm: constants.HashNameItem,
) -> str:
    hashCtx = Hash(hashAlgorithm.algorithm)
    if isinstance(inp, bytes):
        hashCtx.update(inp)
        return "%s:%s" % (
            hashAlgorithm.serializedName,
            base64.b64encode(hashCtx.finalize()).decode(),
        )
    for chunk in inp:
        hashCtx.update(chunk)
    return "%s:%s" % (
        hashAlgorithm.serializedName,
        base64.b64encode(hashCtx.finalize()).decode(),
    )


def hashObject(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    hashAlgorithm: constants.HashNameItem | str,
) -> str:
    if isinstance(hashAlgorithm, str):
        hashAlgorithm = constants.mapHashNames[hashAlgorithm]

    if isinstance(inp, str):
        inp = base64.b64decode(inp)
    if hasattr(inp, "public_key"):
        inp = inp.public_key()
    if hasattr(inp, "public_bytes"):
        inp = inp.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    return _hashObject(inp, hashAlgorithm)


def hashObjectContentHash(
    obj: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    domain: str,
    hashAlgorithm: constants.HashNameItem | str,
) -> str:
    return "%s:%s" % (domain, hashObject(obj, hashAlgorithm))


def sortedHash(
    inp: Iterable[str], hashAlgorithm: constants.HashNameItem | str
) -> str:
    obj = map(lambda x: x.encode("utf8"), sorted(inp))
    return _hashObject(obj, hashAlgorithm)


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
    return "argon2:%s" % argon2.PasswordHasher.from_parameters(
        parameters
    ).hash(obj, salt=salt)


def sortedRegistryHash(inp: Iterable[str], url: str, domain: str) -> str:
    return f"{domain}:{sortedRegistryHashRaw(inp, url)}"


def hashTagsContentHash(
    inp: Iterable[str],
    domain: str,
    hashAlgorithm: constants.HashNameItem | str,
) -> str:
    return "%s:%s" % (domain, sortedHash(inp, hashAlgorithm))


def calculateHashesForHashAlgorithms(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    hashAlgorithms: Iterable[constants.HashNameItem],
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
    for algo in hashAlgorithms:
        hashes.append(_hashObject(inp, algo))
    return hashes


def calculateHashes(
    inp, hashAlgorithms: Iterable[constants.HashNameItem | str], failhard=False
) -> list[str]:
    hashAlgorithms = findWorkingHashAlgorithms(
        hashAlgorithms, failhard=failhard
    )
    assert len(hashAlgorithms) > 0, "no working hash algorithms found"
    return calculateHashesForHashAlgorithms(inp, hashAlgorithms)
