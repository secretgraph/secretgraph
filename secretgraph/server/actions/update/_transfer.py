__all__ = ["sync_transfer_value", "transfer_value"]

import base64
import json
import logging
from uuid import uuid4

import httpx
from asgiref.sync import async_to_sync, sync_to_async
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.db.models import F
from django.db.models.functions import Now
from django.utils import timezone
from django.utils.module_loading import import_string

from secretgraph.core.exceptions import LockedResourceError
from secretgraph.server.utils.auth import get_cached_result

from ....core.constants import TransferResult
from ....core.utils.verification import verify
from ...models import Content, ContentReference, ContentTag, Net
from ...utils.conf import get_httpx_params

logger = logging.getLogger(__name__)


@sync_to_async(thread_sensitive=True)
def _create_info_content(request, content: Content, signatures, admin=False):
    references = []
    tags = []
    if admin:
        contents = Content.objects.all()
    else:
        contents = get_cached_result(request, ensureInitialized=True)[
            "Content"
        ]["objects_with_public"]
    for key in contents.filter(
        type="PublicKey",
        contentHash_in=map(lambda x: f"Key:{x}", signatures.keys()),
    ):
        found_references = True
        signature = signatures[key.contentHash.removeprefix("Key:")][
            "signature"
        ]
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
        Net.objects.filter(id=content.net_id).update(
            bytes_in_use=F("bytes_in_use") + size_diff, last_used=Now()
        )
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
        Net.objects.filter(id=content.net_id).update(
            bytes_in_use=F("bytes_in_use") + size_diff, last_used=Now()
        )


# can be also used for server to server transfers (transfer=False)
async def transfer_value(
    request,
    content: Content,
    is_transfer,
    key=None,
    url=None,
    headers=None,
    session=None,
    keepalive=None,
    key_hashes=None,
    delete_on_failed_verification=True,
    delete_on_error=False,
    admin=False,
    skip_info_creation=False,
):
    if content.locked:
        raise LockedResourceError("Content is locked for transfer/pull")
    _headers = {}
    if keepalive is None:
        keepalive = bool(session)
    if key:
        assert not url, "can only specify key or url"
        decryptor = AESGCM(key)
        try:
            raw_bytes = base64.b64decode(
                (
                    await content.tags.only("tag").aget(
                        tag__startswith="~transfer_url="
                    )
                ).tag.split("=", 1)[1]
            )
            url = decryptor.decrypt(
                raw_bytes[:13],
                raw_bytes[13:],
                None,
            ).decode()
        except Exception as exc:
            logger.error("Error while decoding url", exc_info=exc)
            return TransferResult.ERROR
        try:
            async for tag in content.tags.only("tag").filter(
                tag__startswith="~transfer_header="
            ):
                raw_bytes = base64.b64decode(tag.tag.split("=", 1)[1])
                # headers must be ascii
                header = (
                    decryptor.decrypt(raw_bytes[:13], raw_bytes[:13], None)
                    .decode("ascii")
                    .split("=", 1)
                )
                if len(header) == 2:
                    _headers[header[1]] = header[2]
        except Exception as exc:
            logger.error("Error while decoding headers", exc_info=exc)
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
        if len(checknonce) < 20:
            logger.error("Invalid nonce (not at least 13 bytes)")
            # if transfer, fail, otherwise ignore
            if is_transfer:
                await content.adelete()
                return TransferResult.NONRECOVERABLE_ERROR
        if len(checknonce) > 48:
            logger.error("Invalid nonce (too big)")
            # if transfer, fail, otherwise ignore
            if is_transfer:
                await content.adelete()
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

    if (
        is_transfer
        and not await content.references.filter(group="transfer").aexists()
    ):
        raise ValueError("Not a transfer object")
    content.locked = timezone.now()
    await content.asave(update_fields=["locked"])

    destroy_content = False
    transfer_successful = False

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
                if delete_on_failed_verification:
                    destroy_content = True
                else:
                    transfer_successful = True
                return TransferResult.FAILED_VERIFICATION
            # transfers need correctly signed contents and not arbitary urls
            if is_transfer:
                if delete_on_failed_verification:
                    destroy_content = True
                else:
                    transfer_successful = True
                return TransferResult.FAILED_VERIFICATION
        elif is_transfer:
            await content.references.filter(group="transfer").adelete()
        transfer_successful = True
    except Exception as exc:
        logger.error("data transfer failed", exc_info=exc)
        # file is maybe partially written, just reset to 0
        with content.file.open("wb") as f:
            f.write(b"")
        if delete_on_error:
            destroy_content = True
        return TransferResult.ERROR
    finally:
        # first recalculate bytes usage
        await Net.objects.filter(id=content.net_id).aupdate(
            bytes_in_use=F("bytes_in_use") - orig_size + content.file.size,
            last_used=Now(),
        )
        if destroy_content:
            # then delete with the correct amount of bytes
            # why? adelete recalculates byte usage
            await content.adelete()
        else:
            # unlock

            if transfer_successful:
                if await content.tags.filter(tag="freeze").aexists():
                    await content.tags.filter(tag="freeze").adelete()
                    await content.tags.acreate(ContentTag(tag="immutable"))
                # now we create a new update id
                content.updateId = uuid4()
                content.locked = None
                await content.asave(
                    update_fields=["locked", "updateId", "nonce"]
                )

        if not session:
            s.close()
    if not skip_info_creation:
        await _create_info_content(request, content, signatures, admin=admin)
    return TransferResult.SUCCESS


sync_transfer_value = async_to_sync(transfer_value)
