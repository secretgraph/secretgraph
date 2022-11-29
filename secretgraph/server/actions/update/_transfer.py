__all__ = ["transfer_value"]

import base64
import json
import logging
from uuid import uuid4
from email.parser import BytesParser

from asgiref.sync import sync_to_async
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db.models import F
from django.utils.module_loading import import_string
from django.conf import settings
from secretgraph.core.exceptions import (
    LockedResourceError,
)

from secretgraph.server.utils.auth import get_cached_result


from ....core.constants import TransferResult
from ....core.utils.verification import verify
from ...utils.conf import get_httpx_params
from ...models import Net, Content, ContentReference, ContentTag

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
def _create_info_content(request, content: Content, signatures, admin=False):
    references = []
    tags = []
    if admin:
        contents = Content.objects.all()
    else:
        contents = get_cached_result(request, ensureInitialized=True)[
            "Content"
        ]["objects"]
    for key in contents.filter(
        type="PublicKey",
        contentHash_in=map(lambda x: f"Key:{x}", signatures.keys()),
    ):
        found_references = True
        signature = signatures[key.contentHash.split(":", 1)[1]]["signature"]
        references.append(
            ContentReference(
                group="signature",
                extra=signature,
                target=key,
            )
        )
    if found_references:
        size_before = content.size_references
        content.references.bulk_create(references, ignore_conflict=True)
        size_diff = content.size_references - size_before
        content.net.update(bytes_in_use=F("bytes_in_use") + size_diff)
    else:
        for chash in signatures.keys():
            signature = signatures[chash]
            tags.append(
                ContentTag(tag=f"signature={chash}={signature['signature']}")
            )
            tags.append(
                ContentTag(tag=f"key_link={chash}={signature['link']}")
            )
        size_before = content.size_tags
        content.tags.bulk_create(tags, ignore_conflict=True)
        size_diff = content.size_tags - size_before
        content.net.update(bytes_in_use=F("bytes_in_use") + size_diff)


@sync_to_async(thread_sensitive=True)
def _lock_content(content: Content, transfer):
    if transfer and not content.references.filter(group="transfer").exists():
        raise ValueError("Not a transfer object")

    try:
        content.tags.create(ContentTag(tag="immutable"))
    except Exception as exc:
        raise LockedResourceError("already locked") from exc
    had_hide = content.hide
    if not had_hide:
        content.hide = True
        content.save(update_fields=["hide"])
    return had_hide


@sync_to_async(thread_sensitive=True)
def _save_content(content):
    content.save(update_fields=["hide", "updateId", "nonce"])


@sync_to_async(thread_sensitive=True)
def _delete_content(content):
    content.delete()


# can be also used for server to server transfers (transfer=False)
async def transfer_value(
    request,
    content: Content,
    key=None,
    url=None,
    headers=None,
    transfer=True,
    session=None,
    keepalive=None,
    key_hashes=None,
    delete_failed_verification=True,
    admin=False,
    skip_info_creation=False,
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
    if session:
        s = session
    elif inline_domain:
        s = httpx.AsyncClient(app=import_string(settings.ASGI_APPLICATION))
    else:
        s = httpx.AsyncClient()

    # do this basic checks before locking
    response = await s.get(url, headers=_headers, **params)
    if response.status_code == 404:
        return TransferResult.NOTFOUND
    elif response.status_code != 200:
        return TransferResult.ERROR

    orig_size = 0
    try:
        orig_size = content.file.size
    except Exception as exc:
        logger.warning("Could not determinate file size", exc_info=exc)
    # should be only one nonce
    checknonce = response.get("X-NONCE", "")
    if checknonce != "":
        if len(checknonce) != 20:
            logger.error("Invalid nonce (not 13 bytes)")
            # if transfer, fail, otherwise ignore
            if transfer:
                await _delete_content(content)
                return TransferResult.NONRECOVERABLE_ERROR
        else:
            content.nonce = checknonce
    size_limit = content.net.quota
    if size_limit is not None:
        size_limit -= content.net.bytes_in_use
    # size limit is remaining bytes
    if content.net.max_upload_size is not None:
        if size_limit:
            size_limit = min(content.net.max_upload_size, size_limit)
        else:
            size_limit = content.net.max_upload_size
    if size_limit is not None:
        if (
            "Content-Length" not in response
            or response["Content-Length"] > size_limit
        ):
            return TransferResult.RESOURCE_LIMIT_EXCEEDED

    had_hide = await _lock_content(content, transfer)
    destroy_content = False

    signatures = None
    try:
        with content.file.open("wb") as f:
            signatures, errors = await verify(
                session=s,
                url=response,
                key_hashes=key_hashes,
                write_chunk=f.write,
            )
        if not signatures:
            # was a secretgraph content and verification failed
            if errors:
                if delete_failed_verification:
                    destroy_content = True
                return TransferResult.FAILED_VERIFICATION
            # transfers need correctly signed contents and not arbitary urls
            if transfer:
                if delete_failed_verification:
                    destroy_content = True
                return TransferResult.FAILED_VERIFICATION
        elif transfer:
            await content.references.filter(group="transfer").adelete()
    except Exception as exc:
        logger.error("transfer failed", exc_info=exc)
        # file is maybe partially written, do the best possible:
        # just remove the content
        # MAYBE: later we can cache the original content and restore it
        # in case it is not too big (e.g. url)
        destroy_content = True
        return TransferResult.NONRECOVERABLE_ERROR
    finally:
        # first recalculate bytes usage
        await Net.objects.filter(id=content.net.id).aupdate(
            bytes_in_use=F("bytes_in_use") - orig_size + content.file.size
        )
        if destroy_content:
            # then delete with the correct amount of bytes
            _delete_content(content)
        else:
            if await content.tags.filter(tag="freeze").aexists():
                await content.tags.filter(tag="freeze").adelete()
            else:
                await content.tags.filter(tag="immutable").adelete()
            if not had_hide:
                content.hide = False
            content.updateId = uuid4()
            await _save_content(content)

        if not session:
            s.close()
    if not skip_info_creation:
        await _create_info_content(request, content, signatures, admin=admin)
    return TransferResult.SUCCESS
