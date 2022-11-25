from base64 import b64decode
from typing import Iterable
import asyncio
from urllib.parse import parse_qs, urlsplit, urljoin
from cryptography.hazmat.primitives.serialization import load_der_public_key
from cryptography.hazmat.primitives import padding
import httpx

from ..constants import mapHashNames, HashNameItem
from .graphql import transform_payload
from .hashing import (
    findWorkingHashAlgorithms,
    calculateHashesForHashAlgorithms,
)

contentVerification_query = """
query contentVerificationQuery(
    $id: GlobalID!
    $authorization: [String!]
    $includeTags: [String!]
) {
    secretgraph(authorization: $authorization) {
        node(id: $id) {
            ... on Content {
                references(
                    filters: {
                        groups: ["signature"]
                        includeTags: $includeTags
                    }
                ) {
                    edges {
                        node {
                            extra
                            target {
                                link
                                type
                            }
                        }
                    }
                }
            }
        }
    }
}
"""


def _clean_keyhash(val: str):
    val = val.strip().removeprefix("key_hash").removeprefix("key_hash")
    return f"key_hash={val}"


def _verify_signature(key, message, signature):
    signature = signature.split(":", 1)
    if signature[0] not in mapHashNames or len(signature) != 2:
        return False
    hashalgo, signature = mapHashNames[signature[0]], b64decode(signature[1])
    return key.verify(
        signature,
        message,
        padding.PSS(
            mgf=padding.MGF1(hashalgo.algorithm),
            salt_length=padding.PSS.MAX_LENGTH,
        ),
        hashalgo.algorithm,
    )


async def _verify_helper(
    retmap,
    content,
    session,
    url,
    signature,
    key_hashes: set[str],
    hashalgorithms: Iterable[HashNameItem],
):
    contentResponse = await session.get(url)
    calced_hashes = calculateHashesForHashAlgorithms(hashalgorithms)
    if key_hashes:
        if set(calced_hashes).isdisjoint(key_hashes):
            raise ValueError("invalid key, no hash algorithm matches")
    key = load_der_public_key(contentResponse.content)
    if _verify_signature(key, content, signature):
        retmap[calced_hashes[0]] = key


async def verify(
    session: httpx.AsyncClient,
    url: str,
    key_hashes: Iterable[str] = (),
    early_exit: bool = False,
):
    contentResponse = await session.get(url)
    content = contentResponse.content
    hashalgorithms = findWorkingHashAlgorithms(
        contentResponse["X-HASH-ALGORITHMS"]
    )
    graphqlurl = urljoin(url, contentResponse["X-GRAPHQL-PATH"])
    retmap = {}
    key_hashes = set(map(_clean_keyhash, key_hashes))
    body, files = transform_payload(
        contentVerification_query, {"includeTags": list(key_hashes)}
    )
    result = (await session.post(graphqlurl, data=body, files=files)).json()
    ops = []

    for ref in result["secretgraph"]["node"]["references"]["edges"]:
        signature = ref["extra"]
        link = ref["node"]["link"]
        ops.append(
            _verify_helper(
                retmap=retmap,
                content=content,
                session=session,
                signature=signature,
                url=urljoin(url, link),
                hashalgorithms=hashalgorithms,
                key_hashes=key_hashes,
            )
        )
    errors = []
    for coro in asyncio.as_completed(ops):
        try:
            await coro
            if early_exit:
                return retmap, list(errors)
        except Exception as exc:
            errors.append(exc)
    return retmap, list(errors)
