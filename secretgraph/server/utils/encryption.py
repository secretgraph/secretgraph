import base64
import logging
import os
import tempfile
from io import BytesIO
from typing import Iterable

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_der_private_key
from django.conf import settings
from django.db.models import Exists, OuterRef, Q, Subquery

from ...constants import TransferResult
from ..models import Content, ContentReference

logger = logging.getLogger(__name__)


default_padding = padding.OAEP(
    mgf=padding.MGF1(algorithm=hashes.SHA256()),
    algorithm=hashes.SHA256(),
    label=None,
)


def encrypt_into_file(infile, key=None, nonce=None, outfile=None):
    if isinstance(infile, bytes):
        infile = BytesIO(infile)
    elif isinstance(infile, str):
        infile = BytesIO(base64.b64decode(infile))
    if not outfile:
        outfile = tempfile.NamedTemporaryFile(
            suffix=".encrypt", dir=settings.FILE_UPLOAD_TEMP_DIR
        )
    nonce = os.urandom(13)
    if not key:
        key = os.urandom(32)
    encryptor = Cipher(
        algorithms.AES(key), modes.GCM(nonce), backend=default_backend()
    ).encryptor()

    chunk = infile.read(512)
    while chunk:
        assert isinstance(chunk, bytes)
        outfile.write(encryptor.update(chunk))
        chunk = infile.read(512)
    outfile.write(encryptor.finalize())
    outfile.write(encryptor.tag)
    return outfile, nonce, key


def create_key_maps(contents, keyset=()):
    """
    queries transfers and create content key map
    """
    from ..models import ContentTag

    key_map1 = {}
    for keyspec in keyset:
        keyspec = keyspec.split(":", 1)
        if len(keyspec) == 2:
            _key = base64.b64decode(keyspec[1])
            # is hash, flexid or global id
            key_map1[f"id={keyspec[0]}"] = _key
            key_map1[f"key_hash={keyspec[0]}"] = _key

    reference_query = ContentReference.objects.filter(
        Q(group="key") | Q(group="transfer"), source__in=contents
    )

    key_query = Content.objects.filter(
        tags__tag="type=PrivateKey",
        tags__tag__in=key_map1.keys(),
    ).annotate(
        matching_tag=Subquery(
            ContentTag.objects.filter(content_id=OuterRef("pk")).values("tag")[
                :1
            ]
        )
    )
    content_key_map = {}
    transfer_key_map = {}
    for ref in reference_query.annotate(
        matching_tag=Subquery(
            ContentTag.objects.filter(
                content_id=OuterRef("pk"), tag__in=key_map1.keys()
            ).values("tag")[:1]
        )
    ):
        esharedkey = base64.b64decode(ref.extra)
        sharedkey = None
        if ref.matching_tag:
            matching_key = key_map1[ref.matching_tag]
            nonce = matching_key[:13]
            matching_key = matching_key[13:]
            aesgcm = AESGCM(matching_key)
            try:
                aesgcm = AESGCM(matching_key)
                sharedkey = aesgcm.decrypt(esharedkey, nonce, None)
            except Exception as exc:
                logger.warning(
                    "Could not decode shared key (direct)", exc_info=exc
                )
        if not sharedkey:
            for key in key_query.filter(referencedby__source__in=ref.target):
                try:
                    nonce = base64.b64decode(key.nonce)
                    aesgcm = AESGCM(matching_key)
                    privkey = aesgcm.decrypt(
                        key.file.open("rb").read(), nonce, None
                    )
                    privkey = load_der_private_key(
                        privkey, None, default_backend()
                    )
                except Exception as exc:
                    logger.warning(
                        "Could not decrypt privkey key (privkey)", exc_info=exc
                    )
                    continue

                try:
                    shared_key = privkey.decrypt(esharedkey, default_padding)
                except Exception as exc:
                    logger.warning(
                        "Could not decrypt shared key (privkey)", exc_info=exc
                    )
                    continue
        if shared_key:
            if ref.group == "key":
                content_key_map[ref.content_id] = shared_key
            else:
                transfer_key_map[ref.content_id] = shared_key
    return content_key_map, transfer_key_map


class ProxyTag:
    _key = None
    _query = None

    def __init__(self, query, key=None):
        self._query = query
        self._key = key

    def _persist(self):
        if not isinstance(self._query, list):
            self._query = list(self._query)

    def __getitem__(self, index):
        self._persist()
        try:
            splitted = self._query[index].tag.split("=", 1)
        except Exception:
            return False

        if len(splitted) == 1:
            return True
        if not self._key:
            return splitted[1]
        try:
            m = base64.b64decode(splitted[1])
        except Exception:
            return splitted[1]
        try:
            decryptor = AESGCM(self._key)
            return decryptor.decrypt(m[:13], m[13:])
        except Exception as exc:
            raise IndexError(f"Cannot decrypt index: {index}") from exc

    def first(self):
        return self[0]


class ProxyTags:
    _key = None
    _query = None

    def __init__(self, query, key=None):
        self._query = query
        self._key = key

    def __getattr__(self, attr):
        q = self._query.filter(tag__startswith=attr)
        return ProxyTag(q, self._key)


def iter_decrypt_contents(
    result, *, queryset=None, decryptset=None
) -> Iterable[Iterable[str]]:
    from ..actions.update import transfer_value

    if not decryptset:
        decryptset = result["authset"]
    # copy query
    content_query = (queryset or result["objects"]).all()
    # per default verifiers=None, so that a failed verifications cannot happen
    content_query.only_direct_fetch_action_trigger = True
    content_map, transfer_map = create_key_maps(content_query, decryptset)

    # main query, restricted to PublicKeys and decoded contents
    query = content_query.filter(
        Q(tags__tag="type=PublicKey")
        | Q(tags__tag="type=public")
        | Q(id__in=content_map.keys())
    ).annotate(
        is_transfer=Exists(
            ContentReference.objects.filter(
                source=OuterRef("pk"), group="transfer"
            )
        ),
        active_action_ids=Subquery(
            result["actions"]
            .filter(
                Q(contentAction__content_id=OuterRef("id"))
                | Q(contentAction=None),
                id__in=result["forms"].keys(),
            )
            .values("id")
        ),
    )

    for content in query:
        if content.id in transfer_map:
            verifiers = set()
            for action_id in content.active_action_ids:
                verifiers.update(
                    result["forms"][action_id].get("requiredKeys") or []
                )
            if not verifiers:
                verifiers = None
            else:
                verifiers = content_query.filter(id__in=verifiers)
            result = transfer_value(
                content,
                key=transfer_map[content.id],
                transfer=True,
                verifiers=verifiers,
            )
            if result in {
                TransferResult.NOTFOUND,
                TransferResult.FAILED_VERIFICATION,
            }:
                content.delete()
                continue
            elif result != TransferResult.SUCCESS:
                continue
        elif content.is_transfer:
            continue
        if content.id in content_map:
            try:
                decryptor = Cipher(
                    algorithms.AES(content_map[content.id]),
                    modes.GCM(base64.b64decode(content.nonce)),
                    backend=default_backend(),
                ).decryptor()
            except Exception as exc:
                logger.warning(
                    "creating decrypting context failed", exc_info=exc
                )
                continue
            content.tags.proxy = ProxyTags(
                content.tags, content_map[content.id]
            )

            def _generator():
                with content.file.open() as fileob:
                    chunk = fileob.read(512)
                    nextchunk = None
                    while chunk:
                        nextchunk = fileob.read(512)
                        assert isinstance(chunk, bytes)
                        if nextchunk:
                            yield decryptor.update(chunk)
                        else:
                            yield decryptor.update(chunk[:-16])
                            yield decryptor.finalize_with_tag(chunk[-16:])
                        chunk = nextchunk
                result["objects"].fetch_action_trigger(content)

        else:
            content.tags.proxy = ProxyTags(content.tags)

            def _generator():
                with content.file.open() as fileob:
                    chunk = fileob.read(512)
                    while chunk:
                        yield chunk
                        chunk = fileob.read(512)
                result["objects"].fetch_action_trigger(content)

        content.read_decrypt = _generator
        yield content
