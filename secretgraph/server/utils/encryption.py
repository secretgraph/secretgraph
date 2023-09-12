import base64
import logging
import os
import tempfile
from io import BytesIO
from typing import Iterable

from cryptography import exceptions
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_der_private_key
from django.conf import settings
from django.db.models import Exists, F, OuterRef, Q, Subquery

from ...core.constants import TransferResult, mapHashNames, public_states
from ..models import Content, ContentReference

logger = logging.getLogger(__name__)


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
    encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()

    chunk = infile.read(512)
    while chunk:
        assert isinstance(chunk, bytes)
        outfile.write(encryptor.update(chunk))
        chunk = infile.read(512)
    outfile.write(encryptor.finalize())
    outfile.write(encryptor.tag)
    return outfile, nonce, key


def create_key_maps(contents, keyset):
    """
    queries transfers and create content key map
    """
    from ..models import ContentTag

    key_map_key = {}
    key_map_id = {}
    for keyspec in keyset:
        if not keyspec:
            continue
        # we have the format hashalgo:hash:key, so use rsplit
        keyspec = keyspec.rsplit(":", 1)
        if len(keyspec) == 2:
            _key = base64.b64decode(keyspec[1])
            # is hash
            if ":" in keyspec[0]:
                key_map_key[f"key_hash={keyspec[0]}"] = _key
            else:
                # is flexid or global id
                key_map_id[keyspec[0]] = _key

    reference_query = ContentReference.objects.filter(
        Q(group="key") | Q(group="transfer"), source__in=contents
    )

    key_query = Content.objects.filter(
        Q(tags__tag__in=key_map_key.keys()),
        type="PrivateKey",
    ).annotate(
        matching_tag=Subquery(
            ContentTag.objects.filter(
                tag__in=key_map_key.keys(), content_id=OuterRef("pk")
            ).values("tag")[:1]
        )
    )
    content_key_map = {}
    transfer_key_map = {}
    for ref in reference_query.annotate(
        matching_tag=Subquery(
            ContentTag.objects.filter(
                content_id=OuterRef("target"), tag__in=key_map_key.keys()
            ).values("tag")[:1]
        ),
        flexid=F("target__flexid"),
        flexid_cached=F("target__flexid_cached"),
    ):
        split = ref.extra.split(":", 1)
        if len(split) == 1:
            logger.warning(
                "Invalid key reference, does not contain hash algorithm"
            )
            continue
        else:
            esharedkey = base64.b64decode(split[1])
            algo = mapHashNames[split[0]].algorithm
            key_padding = padding.OAEP(
                mgf=padding.MGF1(algorithm=algo),
                algorithm=algo,
                label=None,
            )
        shared_key = None
        matching_key = None
        if ref.matching_tag:
            matching_key = key_map_key[ref.matching_tag]
            if not matching_key:
                continue
            for key in key_query.filter(references__target=ref.target):
                try:
                    nonce = base64.b64decode(key.nonce)
                    aesgcm = AESGCM(matching_key)
                    privkey = aesgcm.decrypt(
                        nonce, key.file.open("rb").read(), None
                    )
                    privkey = load_der_private_key(privkey, None)
                except Exception as exc:
                    logger.warning(
                        "Could not decrypt privkey key (privkey)", exc_info=exc
                    )
                    continue

                try:
                    shared_key = privkey.decrypt(
                        esharedkey,
                        key_padding,
                    )
                except Exception as exc:
                    logger.warning(
                        "Could not decrypt shared key", exc_info=exc
                    )
                    continue
                if shared_key:
                    break
            if shared_key:
                if ref.group == "key":
                    content_key_map[ref.source_id] = shared_key
                else:
                    transfer_key_map[ref.source_id] = shared_key
        else:
            if ref.flexid_cached in key_map_id:
                matching_key = key_map_id[ref.flexid_cached]
            elif ref.flexid in key_map_id:
                matching_key = key_map_id[ref.flexid]
            if not matching_key:
                continue

            # try to decode shared key directly
            aesgcm = None
            try:
                aesgcm = AESGCM(matching_key)
            except ValueError:
                pass
            if aesgcm:
                shared_key = matching_key

                # prefer key from private key method
                if ref.group == "key":
                    if not content_key_map.get(ref.source_id):
                        content_key_map[ref.source_id] = shared_key
                else:
                    if not transfer_key_map.get(ref.source_id):
                        transfer_key_map[ref.source_id] = shared_key
    return content_key_map, transfer_key_map


class ProxyTag:
    _decryptor = None
    _query = None

    def __init__(self, query, decryptor=None):
        self._query = query
        self._decryptor = decryptor

    def _persist(self):
        if not isinstance(self._query, list):
            self._query = list(self._query)

    def __getitem__(self, index):
        self._persist()
        # fails if length is exhausted
        try:
            splitted = self._query[index].tag.split("=", 1)
        except IndexError as exc:
            if index != 0:
                raise exc
            return False

        # is tag
        if len(splitted) == 1:
            return True
        if not self._decryptor or not splitted[0].startswith("~"):
            return splitted[1]
        try:
            m = base64.b64decode(splitted[1])
        except Exception as exc:
            logger.info(
                "Cannot decrypt index: %s of content: %s",
                index,
                self._query[index].tag.content_id,
                exc_info=exc,
            )
            return None
        try:
            return self._decryptor.decrypt(m[:13], m[13:])
        except Exception as exc:
            logger.info(
                "Cannot decrypt index: %s of content: %s",
                index,
                self._query[index].tag.content_id,
                exc_info=exc,
            )
            return None

    def __len__(self):
        self._persist()
        return len(self._query)

    def first(self):
        return self[0]

    def last(self):
        return self[-1]


class ProxyTags:
    _decryptor = None
    _query = None

    def __init__(self, query, key=None):
        self._query = query
        self._decryptor = AESGCM(key) if key else None

    def __getattr__(self, attr):
        q = self._query.filter(
            Q(tag__startswith=attr) | Q(tag__startswith=f"~{attr}=")
        )
        return ProxyTag(q, self._decryptor)

    def __contains__(self, attr):
        return len(getattr(self, attr)) > 0


def iter_decrypt_contents(
    result, /, *, queryset=None, decryptset=None
) -> Iterable[Content]:
    from ..actions.update import sync_transfer_value

    if decryptset is None:
        raise Exception("decryptset is missing")
    # copy query
    content_query = (queryset or result["objects_with_public"]).all()
    content_map, transfer_map = create_key_maps(content_query, decryptset)
    # main query, restricted to PublicKeys and decoded contents
    query = content_query.filter(
        Q(type="PublicKey")
        | Q(state__in=public_states)
        | Q(id__in=content_map.keys())
    ).annotate(
        is_transfer=Exists(
            ContentReference.objects.filter(
                source=OuterRef("pk"), group="transfer"
            )
        ),
    )

    for content in query:
        # check  if content should be transfered
        if content.id in transfer_map:

            def _start_transfer():
                verifiers = Content.objects.trusted_keys()
                if not verifiers:
                    verifiers = None
                else:
                    verifiers = content_query.filter(id__in=verifiers)
                result = sync_transfer_value(
                    content,
                    key=transfer_map[content.id],
                    is_transfer=True,
                    verifiers=verifiers,
                    delete_on_failed_verification=True,
                    delete_on_error=False,
                )
                # transfer failed
                if result in {
                    TransferResult.NOTFOUND,
                    TransferResult.FAILED_VERIFICATION,
                }:
                    content.start_transfer = None
                    content.delete()
                    return False
                elif result != TransferResult.SUCCESS:
                    return False
                content.start_transfer = None
                return True

            content.start_transfer = _start_transfer

        elif content.is_transfer:
            continue
        else:
            content.start_transfer = None

        # we can decrypt content now (transfers are also completed)
        if content.id in content_map:
            try:
                decryptor = Cipher(
                    algorithms.AES(content_map[content.id]),
                    modes.GCM(base64.b64decode(content.nonce)),
                ).decryptor()
            except Exception as exc:
                logger.warning(
                    "creating decrypting context failed", exc_info=exc
                )
                continue
            content.tags_proxy = ProxyTags(
                content.tags, content_map[content.id]
            )

            def _read_decrypt() -> Iterable[bytes]:
                if content.start_transfer:
                    if not content.start_transfer():
                        return
                with content.file.open() as fileob:
                    chunk = fileob.read(512)
                    nextchunk = None
                    while chunk:
                        nextchunk = fileob.read(4096)
                        assert isinstance(chunk, bytes)
                        if nextchunk and len(nextchunk) > 16:
                            yield decryptor.update(chunk)
                        else:
                            if nextchunk:
                                chunk += nextchunk
                                nextchunk = None
                            yield decryptor.update(chunk[:-16])
                            try:
                                yield decryptor.finalize_with_tag(chunk[-16:])
                            except exceptions.InvalidTag:
                                logging.warning(
                                    "Error decoding crypted content: %s (%s)",
                                    content.flexid,
                                    content.type,
                                )
                        chunk = nextchunk

            _read_decrypt.key = content_map[content.id]
            content.read_decrypt = _read_decrypt

        elif content.state in public_states:
            content.tags_proxy = ProxyTags(content.tags)
        else:
            # otherwise garbled encrypted output could happen
            logger.warning("content %s could not be decrypted", content.flexid)
            continue

        yield content
