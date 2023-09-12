import asyncio
from typing import Callable, Iterable, Optional
from urllib.parse import parse_qs, urljoin

import httpx
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed
from cryptography.hazmat.primitives.hashes import Hash
from cryptography.hazmat.primitives.serialization import load_der_public_key

from ...queries.content import contentVerificationQuery
from ..constants import HashNameItem, mapHashNames
from .hashing import (
    calculateHashesForHashAlgorithms,
    findWorkingHashAlgorithms,
)


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
        calced_hashes = calculateHashesForHashAlgorithms(
            keyResponse.content, hashAlgorithms
        )
        if set(calced_hashes).isdisjoint(key_hashes):
            raise ValueError("invalid key, no hash algorithm matches")
    else:
        calced_hashes = calculateHashesForHashAlgorithms(
            keyResponse.content, hashAlgorithms[:1]
        )
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
    /,
    content_id: Optional[str] = None,
    write_chunk: Optional[Callable[[bytes], None]] = None,
    key_hashes: Iterable[str] = (),
    exit_first: bool = False,
    write_finalize: Optional[Callable[[], bytes]] = None,
):
    if isinstance(url, httpx.Response):
        contentResponse = url
        url = contentResponse.request.url
        splitted_url = url.split("?", 1)
        authorization = (
            contentResponse.request.headers.get("Authorization") or ""
        )
        if not authorization:
            if len(splitted_url) == 2:
                qs = parse_qs(splitted_url[1])
                authorization = ",".join(qs.get("token") or [])
    else:
        authorization = ""
        splitted_url = url.split("?", 1)
        if len(splitted_url) == 2:
            qs = parse_qs(splitted_url[1])
            authorization = ",".join(qs.get("token") or [])
        contentResponse = await session.get(
            splitted_url[0], headers={"Authorization": authorization}
        )

    contentResponse.raise_for_status()
    raw_hashalgorithms = contentResponse.headers.get("X-HASH-ALGORITHMS") or ""
    raw_gqlpath = contentResponse.headers.get("X-GRAPHQL-PATH") or ""

    if raw_hashalgorithms and raw_gqlpath:
        hashalgorithms = findWorkingHashAlgorithms(
            raw_hashalgorithms.split(",")
        )
        graphqlurl = urljoin(splitted_url[0], raw_gqlpath)
        retmap = {}

        ops = []
        url_map = {}
        signature_map = {}
        if content_id:
            key_hashes_tags = set(map(_clean_keyhash, key_hashes))
            variables = {"id": content_id}
            if key_hashes_tags:
                variables["includeTags"] = list(key_hashes_tags)
            verifyData = (
                (
                    await session.post(
                        graphqlurl,
                        json={
                            "query": contentVerificationQuery,
                            "variables": variables,
                        },
                        headers={"Authorization": authorization},
                    )
                )
                .raise_for_status()
                .json()
            )

            for ref in verifyData["secretgraph"]["node"]["references"][
                "edges"
            ]:
                signature = ref["extra"]
                link = ref["node"]["link"]
                signature = signature.split(":", 1)
                if signature[0] not in mapHashNames or len(signature) != 2:
                    continue
                signHashAlgorithm = mapHashNames[signature[0]]
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
                signature_map[signHashAlgorithm.serializedName]["urls"][
                    joined_link
                ] = signature
        else:
            verifyData = (
                (
                    await session.get(
                        f"{splitted_url[0]}",
                        headers={
                            "Authorization": authorization,
                            "X-KEY-HASH": ",".join(key_hashes),
                        },
                    )
                )
                .raise_for_status()
                .json()
            )

            for _hash, ref in verifyData["signatures"].items():
                signature = ref["signature"]
                link = ref["link"]
                signature = signature.split(":", 1)
                if signature[0] not in mapHashNames or len(signature) != 2:
                    continue
                signHashAlgorithm = mapHashNames[signature[0]]
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
                signature_map[signHashAlgorithm.serializedName]["urls"][
                    joined_link
                ] = signature

        async for chunk in contentResponse.aiter_bytes(512):
            if write_chunk:
                write_chunk(chunk)
            for sig in signature_map.values():
                sig["hashCtx"].update(chunk)
        if write_finalize:
            chunk = write_finalize()
            for sig in signature_map.values():
                sig["hashCtx"].update(chunk)
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
                    return retmap, errors
            except Exception as exc:
                errors.append(exc)
    return retmap, errors
