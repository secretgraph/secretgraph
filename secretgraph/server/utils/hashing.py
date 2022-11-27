from typing import Iterable, Optional
from django.conf import settings
from ...core.typings import PrivateCryptoKey, PublicCryptoKey
from ...core import constants

from ...core.utils.hashing import (
    hashObject as _hashObject,
    hashTagsContentHash as _hashTagsContentHash,
    calculateHashes as _calculateHashes,
)


def hashObject(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
    hashAlgorithm: Optional[constants.HashNameItem | str] = None,
) -> str:
    assert (
        len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0
    ), "no hash algorithms specified"
    if not hashAlgorithm:
        hashAlgorithm = settings.SECRETGRAPH_HASH_ALGORITHMS[0]
    return _hashObject(inp, hashAlgorithm)


def hashTagsContentHash(
    inp: Iterable[str],
    domain: str,
    hashAlgorithm: Optional[constants.HashNameItem | str] = None,
) -> str:
    assert (
        len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0
    ), "no hash algorithms specified"
    if not hashAlgorithm:
        hashAlgorithm = settings.SECRETGRAPH_HASH_ALGORITHMS[0]
    return _hashTagsContentHash(inp, domain, hashAlgorithm)


def calculateHashes(
    inp: bytes | PrivateCryptoKey | PublicCryptoKey | Iterable[bytes],
):
    return _calculateHashes(
        inp, settings.SECRETGRAPH_HASH_ALGORITHMS, failhard=True
    )
