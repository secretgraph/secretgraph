__all__ = [
    "transfer_value"
]

import base64
import json
import logging
from uuid import uuid4
from email.parser import BytesParser

import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db import transaction
from django.db.models import Q
from django.test import Client

from ....constants import TransferResult
from ...utils.conf import get_requests_params
from ...models import Content, ContentTag

from ._verification import retrieve_signatures, verify_signatures

logger = logging.getLogger(__name__)


def _generate_transfer_info(content, hashes_remote, signatures):
    yield ContentTag(
        content=content,
        tag="signature_hash_algorithms=%s" % ",".join(
            map(
                lambda x: x.name,
                hashes_remote
            )
        )
    )
    for remote_key_hash, val in (signatures or {}).items():
        yield ContentTag(
            content=content,
            tag=(
                "signature=%s=%s" % (
                    # = algo=signature=keyhash
                    val["signature"], remote_key_hash
                )
            )
        )
        if val.get("link"):
            yield ContentTag(
                content=content,
                tag=(
                    "key_link=%s=%s" % (
                        remote_key_hash, val["link"]
                    )
                )
            )


def transfer_value(
    content, key=None, url=None, headers=None, transfer=True, session=None,
    keepalive=None, verifiers=None
):
    _headers = {}
    if keepalive is None:
        keepalive = bool(session)
    if key:
        assert not url, "can only specify key or url"
        try:
            _blob = AESGCM(key).decrypt(
                content.value.open("rb").read(),
                base64.b64decode(content.nonce),
                None
            ).split(b'\r\n', 1)
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

    if not transfer and not keepalive:
        _headers["Connection"] = "close"

    params, inline_domain = get_requests_params(url)
    # block content while updating file
    q = Q(id=content.id)
    if transfer:
        q &= Q(tags__tag="transfer")
    hashes_remote = []
    signatures = None
    blocked_contents = Content.objects.filter(q).select_for_update()
    with transaction.atomic():
        # 1. lock content, 2. check if content was deleted before updating
        if not blocked_contents:
            return TransferResult.ERROR
        if inline_domain:
            response = Client().get(
                url,
                SERVER_NAME=inline_domain,
                **_headers
            )
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
                        lambda x: hashes.Hash(
                            getattr(hashes, x.strip().upper()),
                            default_backend()
                        ),
                        set(response.get("X-HASH-ALGORITHMS").split(",")[5])
                    )
                ]
            with content.value.open("wb") as f:
                for chunk in response.streaming_content:
                    f.write(chunk)
                    for i in hashes_remote:
                        i.update(chunk)
            if transfer:
                signatures = retrieve_signatures(
                    url, headers,
                    session=session, params=params,
                    inline_domain=inline_domain,
                    keepalive=keepalive
                )
        else:
            if session:
                s = session
            else:
                s = requests.Session()
            try:
                response = s.get(
                    url,
                    headers=_headers,
                    **params
                )
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
                            lambda x: hashes.Hash(
                                getattr(hashes, x.strip().upper()),
                                default_backend()
                            ),
                            set(
                                response.get(
                                    "X-HASH-ALGORITHMS"
                                ).split(",")[5]
                            )
                        )
                    ]
                with content.value.open("wb") as f:
                    for chunk in response.iter_content(512):
                        f.write(chunk)
                        for i in hashes_remote:
                            i.update(chunk)

                if transfer:
                    signatures = retrieve_signatures(
                        url, headers,
                        session=s, params=params,
                        inline_domain=inline_domain,
                        keepalive=keepalive
                    )
            except Exception as exc:
                logger.error("Error while transferring content", exc_info=exc)
                return TransferResult.ERROR
            finally:
                if not session:
                    s.close()
        if transfer:
            content.references.filter(group="transfer").delete()
            content.tags.bulk_create(
                _generate_transfer_info(
                    content,
                    hashes_remote,
                    signatures
                ),
                ignore_conflict=True
            )
            content.updateId = uuid4()
            content.save(update_fields=["updateId"])
    if transfer and verifiers:
        if not verify_signatures(
            hashes_remote,
            signatures,
            verifiers
        ):
            return TransferResult.FAILED_VERIFICATION
    return TransferResult.SUCCESS
