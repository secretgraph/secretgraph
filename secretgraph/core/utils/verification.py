import asyncio
from typing import Callable, Iterable, Optional
from urllib.parse import parse_qs, urljoin

import httpx
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed
from cryptography.hazmat.primitives.hashes import Hash
from cryptography.hazmat.primitives.serialization import load_der_public_key

from ..constants import HashNameItem, mapHashNames
from .hashing import (
    calculateHashesForHashAlgorithms,
    findWorkingHashAlgorithms,
)

contentVerification_query = """
query contentVerificationQuery(
    $id: GlobalID!
    $includeTags: [String!]
) {
    secretgraph {
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


def _verify_signature(key, hashFinal, signHashAlgorithm, signature):
    return key.verify(
        signature,
        hashFinal,
        padding.PSS(
            mgf=padding.MGF1(signHashAlgorithm.algorithm),
            salt_length=padding.PSS.MAX_LENGTH,
        ),
        Prehashed(signHashAlgorithm.algorithm),
    )


async def _fetch_certificate(
    session,
    url: str,
    authorization: str,
    key_hashes: set[str],
    hashAlgorithms: Iterable[HashNameItem],
):
    keyResponse = await session.get(
        url, headers={"Authorization": authorization}
    )
    if key_hashes:
        calced_hashes = calculateHashesForHashAlgorithms(hashAlgorithms)
        if set(calced_hashes).isdisjoint(key_hashes):
            raise ValueError("invalid key, no hash algorithm matches")
    else:
        calced_hashes = calculateHashesForHashAlgorithms(hashAlgorithms[:1])
    return calced_hashes, load_der_public_key(keyResponse.content), url


async def _verify_helper(
    retmap,
    hashes_key,
    signature,
    signatureDigest: bytes,
    signHashAlgorithm: HashNameItem,
):
    _hashes_key = await hashes_key
    if _verify_signature(
        _hashes_key[1], signatureDigest, signHashAlgorithm, signature
    ):
        retmap[_hashes_key[0][0]] = {
            "key": _hashes_key[1],
            "signature": f"{signHashAlgorithm.serializedName}:{signature}",
            "key_url": _hashes_key[2],
        }


async def verify(
    session: httpx.AsyncClient,
    url: str | httpx.Response,
    write_chunk: Optional[Callable[[bytes], None]] = None,
    key_hashes: Iterable[str] = (),
    exit_first: bool = False,
    write_finalize: Optional[Callable[[], bytes]] = None,
):
    if isinstance(url, httpx.Response):
        contentResponse = url
        url = contentResponse.request.url
    splitted_url = url.split("?", 1)
    qs = {}
    authorization = ""
    if len(splitted_url) == 2:
        qs = parse_qs(splitted_url[1])
        authorization = ",".join(qs.get("token") or [])
    if not contentResponse:
        contentResponse = await session.get(
            splitted_url[0], headers={"Authorization": authorization}
        )
    contentResponse.raise_for_status()
    if (
        "X-GRAPHQL-PATH" in contentResponse
        and "X-GRAPHQL-PATH" in contentResponse
    ):
        hashalgorithms = findWorkingHashAlgorithms(
            contentResponse["X-HASH-ALGORITHMS"]
        )
        graphqlurl = urljoin(
            splitted_url[0], contentResponse["X-GRAPHQL-PATH"]
        )
        retmap = {}
        key_hashes = set(map(_clean_keyhash, key_hashes))
        variables = {}
        if key_hashes:
            variables["includeTags"] = list(key_hashes)
        result = (
            await session.post(
                graphqlurl,
                data=variables,
                headers={"Authorization": authorization},
            )
        ).json()
        ops = []
        url_map = {}
        signature_map = {}

        for ref in result["secretgraph"]["node"]["references"]["edges"]:
            signature = ref["extra"]
            link = ref["node"]["link"]
            signature = signature.split(":", 1)
            signHashAlgorithm = mapHashNames[signature[0]]
            if signature[0] not in mapHashNames or len(signature) != 2:
                continue
            signature_map.setdefault(
                signHashAlgorithm.serializedName,
                {
                    "urls": {},
                    "signHashAlgorithm": signHashAlgorithm,
                    "hashCtx": Hash(signHashAlgorithm.algorithm),
                },
            )
            joined_link = urljoin(splitted_url[0], link)
            url_map[joined_link] = None
            signature_map["urls"][joined_link] = signature

        async for _chunk in contentResponse.aiter_bytes(512):
            chunk = await _chunk
            if write_chunk:
                write_chunk(chunk)
            for sig in signature_map.values():
                sig["hash"].update(chunk)
        if write_finalize:
            chunk = write_finalize()
            for sig in signature_map.values():
                sig["hash"].update(chunk)
        for url in url_map.keys():
            url_map[url] = _fetch_certificate(
                session=session,
                url=url,
                authorization=authorization,
                key_hashes=key_hashes,
                hashAlgorithms=hashalgorithms,
            )

        for sig in signature_map.values():
            signatureDigest = sig["hashCtx"].finalize()
            for url_signature in sig["urls"].items():
                ops.append(
                    _verify_helper(
                        retmap=retmap,
                        signatureDigest=signatureDigest,
                        signature=url_signature[1],
                        hashes_key=url_map[url_signature[0]],
                        signHashAlgorithm=sig["signHashAlgorithm"],
                    )
                )

        errors = []
        for coro in asyncio.as_completed(ops):
            try:
                await coro
                if exit_first:
                    return retmap, list(errors)
            except Exception as exc:
                errors.append(exc)
    return retmap, list(errors)
