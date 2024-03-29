from typing import Iterable, Optional

from django.conf import settings

from ...core.typings import PrivateCryptoKey, PublicCryptoKey
from ...core.utils.base_crypto import mapDeriveAlgorithms
from ...core.utils.hashing import calculateHashes as _calculateHashes
from ...core.utils.hashing import hashObject as _hashObject
from ...core.utils.hashing import hashTagsContentHash as _hashTagsContentHash


def getPrefix(domain: Optional[str] = None):
    assert len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0, "no hash algorithms specified"
    hashAlgorithm = settings.SECRETGRAPH_HASH_ALGORITHMS[0]
    if isinstance(hashAlgorithm, str):
        hashAlgorithm = mapDeriveAlgorithms[hashAlgorithm]
    if domain:
        return "%s:%s:" % (domain, hashAlgorithm.serializedName)
    else:
        return "%s:" % hashAlgorithm.serializedName


async def hashObject(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    hashAlgorithm: Optional[str] = None,
) -> str:
    assert len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0, "no hash algorithms specified"
    if not hashAlgorithm:
        hashAlgorithm = settings.SECRETGRAPH_HASH_ALGORITHMS[0]
    return await _hashObject(inp, hashAlgorithm)


async def hashTagsContentHash(
    inp: Iterable[str],
    domain: str,
    hashAlgorithm: Optional[str] = None,
) -> str:
    assert len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0, "no hash algorithms specified"
    if not hashAlgorithm:
        hashAlgorithm = settings.SECRETGRAPH_HASH_ALGORITHMS[0]
    return await _hashTagsContentHash(inp, domain, hashAlgorithm)


async def calculateHashes(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
) -> list[str]:
    return await _calculateHashes(
        inp, settings.SECRETGRAPH_HASH_ALGORITHMS, failhard=True
    )
