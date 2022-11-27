__all__ = ["transfer_value"]

import base64
from codecs import ignore_errors
from inspect import signature
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

from secretgraph.server.utils.auth import get_cached_result


from ....core.constants import TransferResult
from ....core.utils.verification import verify
from ...utils.conf import get_httpx_params
from ...models import Content, ContentReference, ContentTag

# from ._verification import retrieve_signatures, verify_signatures

logger = logging.getLogger(__name__)

"""
def _generate_transfer_info(content, signatures):
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
"""


@sync_to_async(thread_sensitive=True)
def _create_transfer_info_content(request, content, signatures):
    seen = set()
    references = []
    tags = []
    for key in get_cached_result(request, ensureInitialized=True)["Content"][
        "objects"
    ].filter(contentHash_in=map(lambda x: f"Key:{x}", signatures.keys())):
        seen.add(key)
        references.append(
            ContentReference(
                group="signature",
                extra=signatures[key.contentHash.split(":", 1)[1]][
                    "signature"
                ],
                target=key,
            )
        )
    for chash in signatures.keys():
        if chash in seen:
            continue
        signature = signatures[chash]
        # TODO: fix syntax
        tags.append(ContentTag(tag=f"signature={signature}"))
    content.references.bulk_create(references, ignore_errors=True)
    content.tags.bulk_create(tags, ignore_errors=True)


@sync_to_async(thread_sensitive=True)
def _lock_content(content):
    had_immutable = content.tags.filter(tag="immutable").exists()
    if not had_immutable:
        content.tags.create(ContentTag(tag="immutable"))
    had_hide = content.hide
    if not had_hide:
        content.hide = True
        content.save(update_fields=["hide"])

    return had_immutable, had_hide


@sync_to_async(thread_sensitive=True)
def _save_content(content):
    content.save(update_fields=["hide", "updateId", "nonce"])


# can be also used for server to server transfers (transfer=False)
async def transfer_value(
    content: Content,
    key=None,
    url=None,
    headers=None,
    transfer=True,
    session=None,
    keepalive=None,
    key_hashes=None,
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
    had_immutable, had_hide = await _lock_content(content)
    needs_update = True

    signatures = None
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
        if transfer:
            with content.file.open("wb") as f:
                signatures, errors = await verify(
                    session=s,
                    url=url,
                    key_hashes=key_hashes,
                    contentResponse=response,
                    write_chunk=f.write,
                )
            if errors:
                needs_update = False
                await Content.objects.filter(id=content.id).adelete()
                return TransferResult.ERROR
            elif not signatures:
                needs_update = False
                await Content.objects.filter(id=content.id).adelete()
                return TransferResult.FAILED_VERIFICATION
            else:
                await content.references.filter(group="transfer").adelete()

        else:
            with content.file.open("wb") as f:
                for chunk in response.iter_content(512):
                    f.write(chunk)
                    for i in hashes_remote:
                        i.update(chunk)
    finally:
        if needs_update:
            if not had_immutable:
                await content.tags.filter(tag="immutable").adelete()
            if not had_hide:
                content.hide = False
            content.updateId = uuid4()
            await _save_content(content)

        if not session:
            s.close()
    # if transfer:
    #    await content.tags.abulk_create(
    #        _generate_transfer_info(content, signatures),
    #        ignore_conflict=True,
    #    )
    return TransferResult.SUCCESS
