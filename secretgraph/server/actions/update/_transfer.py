__all__ = [
    "retrieve_signatures", "transfer_value"
]

import base64
import json
import logging
from email.parser import BytesParser

import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db import transaction
from django.db.models import OuterRef, Q, Subquery
from django.db.models.functions import Substr
from django.test import Client

from ....constants import TransferResult
from ....utils.conf import get_requests_params
from ...models import Content, ContentTag

logger = logging.getLogger(__name__)


def retrieve_signatures(
    url, headers, session=None, params=None, inline_domain=None, keepalive=True
):
    if params is None or inline_domain is None:
        params, inline_domain = get_requests_params(url)
    prepared_url = url.rstrip("?&")
    prepared_url = "%s%ssignatures" % (
        prepared_url,
        "&" if "?" in prepared_url else "?"
    )
    jsonob = None
    if inline_domain:
        response = Client().get(
            prepared_url,
            Connection="Keep-Alive" if keepalive else "close",
            SERVER_NAME=inline_domain,
            **headers
        )
        if response.status_code == 200:
            jsonob = response.json()
        else:
            logger.warning(
                "Could not retrieve signatures:\n%s", response.content
            )
    else:
        if session:
            s = session
        else:
            s = requests.Session()
        try:
            response = s.get(
                prepared_url,
                headers={
                    "Connection": "Keep-Alive" if keepalive else "close",
                    **headers
                },
                **params
            )
            if response.status_code == 200:
                jsonob = response.json()
            else:
                logger.warning(
                    "Could not retrieve signatures:\n%s", response.content
                )
        except Exception as exc:
            logger.error("Error while fetching signatures", exc_info=exc)
        finally:
            if not session:
                s.close()
    try:
        for i in jsonob["signatures"].values():
            if "=" not in i.get("signature", ""):
                raise
        return jsonob["signatures"]
    except Exception as exc:
        logger.error("Invalid format:\n%s", jsonob, exc_info=exc)
        return None


def verify_signatures(hashobjects, signatures, contents):
    digest_dict = {
        i.name: (
            getattr(i, "finalize", i.digest)(),
            getattr(hashes, i.upper()),
            utils.Prehashed(getattr(hashes, i.upper()))
        ) for i in hashobjects
    }
    keys = contents.annotate(
        keyHash=Subquery(
            ContentTag.objects.filter(
                content_id=OuterRef("pk"),
                tag__startswith="key_hash="
            ).annotate(
                keyHash=Substr("tag", 10)
            ).filter(
                keyHash__in=signatures.keys()
            ).values("keyHash")[:1]
        )
    ).filter(
        id__in=Subquery(
            ContentTag.objects.filter(
                tag__in=map(
                    lambda x: f"key_hash={x}"
                )
            ).values("content_id")
        ),
        info__tag="type=PublicKey"
    )
    for key in keys:
        try:
            algo, sig = signatures[key.keyHash].split("=", 1)
            if key.load_pubkey().verify(
                base64.b64decode(sig),
                digest_dict[algo][0],
                padding.PSS(
                    mgf=padding.MGF1(digest_dict[algo][1]),
                    salt_length=padding.PSS.MAX_LENGTH
                ),
                digest_dict[algo][2]
            ):
                return key
        except Exception as exc:
            logger.warning(
                "Failed to decode signature", exc_info=exc
            )
    return None


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
    for key, val in (signatures or {}).items():
        yield ContentTag(
            content=content,
            tag=(
                "signature=%s=%s" % (
                    key, val["signature"]
                )
            )
        )
        if val.get("link"):
            yield ContentTag(
                content=content,
                tag=(
                    "key_link=%s=%s" % (
                        key, val["link"]
                    )
                )
            )


def transfer_value(
    content, key=None, url=None, headers=None, transfer=True, session=None,
    keepalive=None
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
        q &= Q(info__tag="transfer")
    hashes_remote = []
    signatures = None
    bcontents = Content.objects.filter(
        q
    ).select_for_update()
    with transaction.atomic():
        # 1. lock content, 2. check if content was deleted before updating
        if not bcontents:
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
            if transfer:
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
                if transfer:
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
            content.info.bulk_create(
                _generate_transfer_info(
                    content,
                    hashes_remote,
                    signatures
                ),
                ignore_conflict=True
            )
            if not verify_signatures(
                hashes_remote,
                signatures,
                Content.objects.filter(
                    Q(cluster=content.cluster) |
                    Q(referencedBy__source=content)
                )
            ):
                return TransferResult.UNVERIFIED
    return TransferResult.SUCCESS
