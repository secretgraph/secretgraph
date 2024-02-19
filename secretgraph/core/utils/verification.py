import asyncio
import logging
from typing import Callable, Iterable, Optional
from urllib.parse import parse_qs, urljoin

import httpx
from cryptography.hazmat.primitives.serialization import load_der_public_key

from ...queries.content import contentVerificationQuery
from ..constants import HashNameItem
from .crypto import mapSignatureAlgorithms
from .crypto import verify as crypto_verify
from .hashing import (
    calculateHashesForHashAlgorithms,
    findWorkingHashAlgorithms,
)

logger = logging.getLogger(__name__)


async def _fetch_certificate(
    session,
    url: str,
    authorization: str,
    key_hashes: set[str],
    hashAlgorithms: Iterable[HashNameItem],
):
    keyResponse = await session.get(url, headers={"Authorization": authorization})
    keyResponse.raise_for_status()
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
    return calced_hashes, keyResponse.content, url


async def _verify_helper(
    retmap,
    hashes_key_url,
    signature,
    signatureDigest: bytes,
):
    hashes, key, url = await hashes_key_url
    if await crypto_verify(
        key, signature=signature, data=signatureDigest, prehashed=True
    ):
        retmap[hashes[0]] = {
            "key": key,
            "signature": signature,
            "key_url": url,
        }


async def verify(
    session: httpx.AsyncClient,
    url: str | httpx.Response,
    /,
    write_chunk: Optional[Callable[[bytes], None]] = None,
    key_hashes: Iterable[str] = (),
    exit_first: bool = False,
    write_finalize: Optional[Callable[[], bytes]] = None,
    force_item=False,
):
    item_id = None
    if isinstance(url, httpx.Response):
        contentResponse = url
        url = str(contentResponse.request.url)
        splitted_url = url.split("?", 1)
        authorization = contentResponse.request.headers.get("Authorization") or ""
        if len(splitted_url) == 2:
            qs = parse_qs(splitted_url[1])
            item_id = qs.get("item")
            if not authorization:
                authorization = ",".join(qs.get("token") or [])
    else:
        authorization = ""
        splitted_url = url.split("?", 1)
        if len(splitted_url) == 2:
            qs = parse_qs(splitted_url[1])
            item_id = qs.get("item")
            authorization = ",".join(qs.get("token") or [])
        contentResponse = await session.get(
            splitted_url[0], headers={"Authorization": authorization}
        )
    if item_id:
        item_id = item_id[0]
    elif force_item:
        raise ValueError("Url GET parameters contained no item")

    contentResponse.raise_for_status()
    raw_hashalgorithms = contentResponse.headers.get("X-HASH-ALGORITHMS") or ""
    raw_gqlpath = contentResponse.headers.get("X-GRAPHQL-PATH") or ""

    retmap = {}
    errors = []
    if raw_hashalgorithms and raw_gqlpath:
        ops = []
        hashalgorithms = findWorkingHashAlgorithms(raw_hashalgorithms.split(","))
        graphqlurl = urljoin(splitted_url[0], raw_gqlpath)

        url_map = {}
        signature_map = {}
        if item_id:
            key_hashes_tags = set(map(lambda x: f"key_hash={key_hashes}", key_hashes))
            variables = {"id": item_id}
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
            )["data"]

            for ref in verifyData["secretgraph"]["node"]["references"]["edges"]:
                signature = ref["node"]["extra"]
                link = ref["node"]["target"]["link"]
                signature_split = signature.split(":", 1)
                if (
                    signature_split[0] not in mapSignatureAlgorithms
                    or len(signature_split) != 2
                ):
                    continue
                signHashAlgorithm = mapSignatureAlgorithms[signature_split[0]]
                signature_map.setdefault(
                    signHashAlgorithm.serializedName,
                    {
                        "urls": {},
                        "signHashAlgorithm": signHashAlgorithm,
                        "hashCtx": await signHashAlgorithm.getHasher(),
                    },
                )
                joined_link = urljoin(splitted_url[0], link)
                url_map[joined_link] = None
                signature_map[signHashAlgorithm.serializedName]["urls"][
                    joined_link
                ] = signature
        else:
            logger.debug("item unknown, use anonymous verification")
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
                signature_split = signature.split(":", 1)
                if (
                    signature_split[0] not in mapSignatureAlgorithms
                    or len(signature_split) != 2
                ):
                    continue
                signHashAlgorithm = mapSignatureAlgorithms[signature_split[0]]
                signature_map.setdefault(
                    signHashAlgorithm.serializedName,
                    {
                        "urls": {},
                        "signHashAlgorithm": signHashAlgorithm,
                        "hashCtx": await signHashAlgorithm.getHasher(),
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
        # fetch certs and get
        for url in url_map.keys():
            url_map[url] = _fetch_certificate(
                session=session,
                url=url,
                authorization=authorization,
                key_hashes=key_hashes,
                hashAlgorithms=hashalgorithms,
            )

        for sig in signature_map.values():
            signatureDigest = sig["signHashAlgorithm"].finalize(sig["hashCtx"])
            for url_signature in sig["urls"].items():
                ops.append(
                    _verify_helper(
                        retmap=retmap,
                        signatureDigest=signatureDigest,
                        signature=url_signature[1],
                        # still a promise
                        hashes_key_url=url_map[url_signature[0]],
                    )
                )

        for coro in asyncio.as_completed(ops):
            try:
                await coro
                if exit_first:
                    return retmap, errors
            except Exception as exc:
                errors.append(exc)
    return retmap, errors
