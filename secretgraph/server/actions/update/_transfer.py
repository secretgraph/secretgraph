__all__ = ["transfer_value"]

import base64
import json
import logging
from uuid import uuid4
from email.parser import BytesParser

from asgiref.sync import sync_to_async
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db.models import Q
from django.utils.module_loading import import_string
from django.conf import settings

from ....constants import TransferResult
from ...utils.conf import get_httpx_params
from ...utils.misc import AsyncAtomic
from ...models import Content, ContentTag

from ._verification import retrieve_signatures, verify_signatures

logger = logging.getLogger(__name__)


def _generate_transfer_info(content, hashes_remote, signatures):
    yield ContentTag(
        content=content,
        tag="signature_hash_algorithms=%s"
        % ",".join(map(lambda x: x.name, hashes_remote)),
    )
    for remote_key_hash, val in (signatures or {}).items():
        yield ContentTag(
            content=content,
            tag=(
                "signature=%s=%s"
                % (
                    # = algo=signature=keyhash
                    val["signature"],
                    remote_key_hash,
                )
            ),
        )
        if val.get("link"):
            yield ContentTag(
                content=content,
                tag=("key_link=%s=%s" % (remote_key_hash, val["link"])),
            )


@sync_to_async(thread_sensitive=True)
def _lock_contents(q):
    return Content.objects.filter(q).select_for_update()


@sync_to_async(thread_sensitive=True)
def _complete_transfer(content, hashes_remote, signatures):
    content.references.filter(group="transfer").delete()
    content.tags.bulk_create(
        _generate_transfer_info(content, hashes_remote, signatures),
        ignore_conflict=True,
    )
    content.updateId = uuid4()
    content.save(update_fields=["updateId"])


async def transfer_value(
    content,
    key=None,
    url=None,
    headers=None,
    transfer=True,
    session=None,
    keepalive=None,
    verifiers=None,
):
    _headers = {}
    if keepalive is None:
        keepalive = bool(session)
    if key:
        assert not url, "can only specify key or url"
        try:
            _blob = (
                AESGCM(key)
                .decrypt(
                    content.file.open("rb").read(),
                    base64.b64decode(content.nonce),
                    None,
                )
                .split(b"\r\n", 1)
            )
            if len(_blob) == 1:
                url = _blob[0]
            else:
                url = _blob[0]
                _headers.update(
                    BytesParser().parsebytes(_blob[1], headersonly=True)
                )
        except Exception as exc:
            logger.error("Error while decoding url, headers", exc_info=exc)
            return TransferResult.ERROR

    if headers:
        if isinstance(headers, str):
            headers = json.loads(headers)
        _headers.update(headers)

    _headers["Connection"] = "Keep-Alive" if keepalive else "close"

    params, inline_domain = get_httpx_params(url)
    # block content while updating file
    q = Q(id=content.id)
    if transfer:
        q &= Q(tags__tag="transfer")
    hashes_remote = []
    if session:
        s = session
    elif inline_domain:
        s = httpx.AsyncClient(app=import_string(settings.ASGI_APPLICATION))
    else:
        s = httpx.AsyncClient()
    signatures = None
    if transfer:
        # otherwise we can run in deadlock issues if same
        signatures = await retrieve_signatures(
            url,
            headers,
            session=s,
            params=params,
            inline_domain=inline_domain,
            keepalive=True,
        )
    async with AsyncAtomic(None, True, False):
        blocked_contents = await _lock_contents(q)
        # 1. lock content, 2. check if content was deleted before updating
        if not blocked_contents:
            return TransferResult.ERROR
        try:
            response = await s.get(url, headers=_headers, **params)
            if response.status_code == 404:
                return TransferResult.NOTFOUND
            elif response.status_code != 200:
                return TransferResult.ERROR
            # should be only one nonce
            checknonce = response.get("X-NONCE", "")
            if checknonce != "":
                if len(checknonce) != 20:
                    logger.warning("Invalid nonce (not 13 bytes)")
                    return TransferResult.ERROR
                content.nonce = checknonce
            if transfer and verifiers:
                hashes_remote = [
                    *map(
                        set(response.get("X-HASH-ALGORITHMS").split(",")[5]),
                    )
                ]
            with content.file.open("wb") as f:
                for chunk in response.iter_content(512):
                    f.write(chunk)
                    for i in hashes_remote:
                        i.update(chunk)

        except Exception as exc:
            logger.error("Error while transferring content", exc_info=exc)
            return TransferResult.ERROR
        finally:
            if not session:
                s.close()
        if transfer:
            await _complete_transfer(content, hashes_remote, signatures)
    if transfer and verifiers:
        if not verify_signatures(hashes_remote, signatures, verifiers):
            return TransferResult.FAILED_VERIFICATION
    return TransferResult.SUCCESS
