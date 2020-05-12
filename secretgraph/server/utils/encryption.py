import base64
import logging
import os
import tempfile
from io import BytesIO
from typing import Iterable

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_der_private_key
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from django.conf import settings
from django.models import Q
from graphql_relay import from_global_id
from rdflib import Graph

from ...constants import TransferResult
from ..models import Content, ContentReference
from ..actions.update import transfer_value


logger = logging.getLogger(__name__)


default_padding = padding.OAEP(
    mgf=padding.MGF1(algorithm=hashes.SHA256()),
    algorithm=hashes.SHA256(),
    label=None
)


def encrypt_into_file(infile, key=None, nonce=None, outfile=None):
    if isinstance(infile, bytes):
        infile = BytesIO(infile)
    elif isinstance(infile, str):
        infile = BytesIO(base64.b64decode(infile))
    if not outfile:
        outfile = tempfile.NamedTemporaryFile(
            suffix='.encrypt', dir=settings.FILE_UPLOAD_TEMP_DIR
        )
    nonce = os.urandom(13)
    if not key:
        key = os.urandom(32)
    encryptor = Cipher(
        algorithms.AES(key),
        modes.GCM(nonce),
        backend=default_backend()
    ).encryptor()

    chunk = infile.read(512)
    while chunk:
        assert isinstance(chunk, bytes)
        outfile.write(encryptor.update(chunk))
        chunk = infile.read(512)
    outfile.write(encryptor.finalize())
    outfile.write(encryptor.tag)
    return outfile, nonce, key


def create_key_map(contents, keyset):
    """
        queries transfers and create content key map
    """
    key_map1 = {}
    for i in keyset:
        i = i.split(":", 1)
        if len(i) == 2:
            _type = "Content"
            try:
                _type, _id = from_global_id(i[0])
                if _type != "Content":
                    continue
                key_map1[f"id={i[0]}"] = _id
            except Exception:
                # is hash or flexid
                key_map1[f"id={i[0]}"] = i[1]
                key_map1[f"key_hash={i[0]}"] = i[1]

    reference_query = ContentReference.objects.filter(
        Q(group="key") |
        Q(group="transfer"),
        source__in=contents
    )

    key_query = Content.objects.filter(
        info__tag="private_key",
        info__tag__in=key_map1.keys(),
        references__in=reference_query
    )
    content_key_map = {}
    transfers = set()
    successfull_transfers = []
    remove_contents = []
    for key in key_query:
        matching_key = key.info.filter(tag__in=key_map1.keys()).first()
        if not matching_key:
            continue
        graph = Graph()
        graph.parse(file=key.value, format="turtle")
        try:
            aesgcm = AESGCM(base64.b64decode(matching_key))
            privkey = aesgcm.decrypt(
                key.value.open("rb").read(),
                base64.b64decode(key.nonce),
                None
            )
            privkey = load_der_private_key(privkey, None, default_backend())
        except Exception as exc:
            logger.info("Could not decode private key", exc_info=exc)
            continue
        for ref in reference_query.filter(
            target=key
        ).only("group", "extra", "source_id"):
            if ref.group == "transfer":
                transfers.add(ref.source_id)
            try:
                shared_key = privkey.decrypt(
                    base64.b64decode(ref.extra),
                    default_padding
                )
            except Exception as exc:
                logger.warning(
                    "Could not decode shared key", exc_info=exc
                )
                continue
            if ref.group == "key":
                content_key_map[ref.source_id]
            else:
                result = transfer_value(
                    ref.content, key=shared_key, cleanup=True
                )
                if result == TransferResult.SUCCESS:
                    successfull_transfers.append(ref.source_id)
                elif result == TransferResult.NOTFOUND:
                    remove_contents.append(ref.source_id)
    for i in transfers.difference(successfull_transfers):
        content_key_map.pop(i, None)
    return content_key_map


def iter_decrypt_contents(
    content_query, decryptset
) -> Iterable[Iterable[str]]:
    content_query.only_direct_fetch_action_trigger = True
    key_map = create_key_map(content_query, decryptset)
    for content in content_query.filter(
        Q(info__tag="public_key") | Q(id__in=key_map.keys())
    ):
        if content.id in key_map:
            try:
                decryptor = Cipher(
                    algorithms.AES(key_map[content.flexid]),
                    modes.GCM(base64.b64decode(content.nonce)),
                    backend=default_backend()
                ).decryptor()
            except Exception as exc:
                logger.warning(
                    "creating decrypting context failed", exc_info=exc
                )
                continue

            def _generator():
                with content.value.open() as fileob:
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
                content_query.fetch_action_trigger(content)
        else:
            def _generator():
                with content.value.open() as fileob:
                    chunk = fileob.read(512)
                    while chunk:
                        yield chunk
                        chunk = fileob.read(512)
                content_query.fetch_action_trigger(content)
        yield _generator()


def encrypt_info_tag(keys, nonce, tag):
    ntags = []
    for key in keys:
        pass

    return ntags
