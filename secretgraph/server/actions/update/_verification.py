__all__ = ["retrieve_signatures", "verify_signatures"]

import base64
import logging

import httpx
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, utils
from django.conf import settings
from django.db.models import OuterRef, Subquery
from django.db.models.functions import Substr
from django.utils.module_loading import import_string

from ...models import ContentTag
from ...utils.conf import get_httpx_params

logger = logging.getLogger(__name__)


async def retrieve_signatures(
    url, headers, session=None, params=None, inline_domain=None, keepalive=True
):
    if params is None or inline_domain is None:
        params, inline_domain = get_httpx_params(url)
    prepared_url = url.rstrip("?&")
    # signatures should be on first page
    prepared_url = "%s%skeys" % (
        prepared_url,
        "&" if "?" in prepared_url else "?",
    )
    jsonob = None
    if session:
        s = session
    elif inline_domain:
        s = httpx.AsyncClient(app=import_string(settings.ASGI_APPLICATION))
    else:
        s = httpx.AsyncClient()
    try:
        response = await s.get(
            prepared_url,
            headers={
                "Connection": "Keep-Alive" if keepalive else "close",
                **headers,
            },
            **params,
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
    digest_dict = {}
    for i in hashobjects:
        chosen_hash_algo = getattr(hashes, i.name.upper())()
        digest_dict[i.name] -= (
            getattr(i, "finalize", i.digest)(),
            chosen_hash_algo,
            utils.Prehashed(chosen_hash_algo),
        )
    keys = contents.annotate(
        keyHash=Subquery(
            ContentTag.objects.filter(
                content_id=OuterRef("pk"), tag__startswith="key_hash="
            )
            .annotate(keyHash=Substr("tag", 10))
            .filter(keyHash__in=signatures.keys())
            .values("keyHash")[:1]
        )
    ).filter(
        id__in=Subquery(
            ContentTag.objects.filter(
                tag__in=map(lambda x: f"key_hash={x}")
            ).values("content_id")
        ),
        type="PublicKey",
    )
    for key in keys:
        try:
            algo, sig = signatures[key.keyHash].split("=", 1)
            if key.load_pubkey().verify(
                base64.b64decode(sig),
                digest_dict[algo][0],
                padding.PSS(
                    mgf=padding.MGF1(digest_dict[algo][1]),
                    salt_length=padding.PSS.MAX_LENGTH,
                ),
                digest_dict[algo][2],
            ):
                return key
        except Exception as exc:
            logger.warning("Failed to decode signature", exc_info=exc)
    return None
