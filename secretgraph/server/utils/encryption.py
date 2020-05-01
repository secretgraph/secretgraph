import base64
import logging
import os
import tempfile

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from django.conf import settings
from graphql_relay import from_global_id
from rdflib import Graph

from ..constants import sgraph_key
from ..models import Content, ContentReference


logger = logging.getLogger(__name__)


default_padding = padding.OAEP(
    mgf=padding.MGF1(algorithm=hashes.SHA256()),
    algorithm=hashes.SHA256(),
    label=None
)


def encrypt_into_file(infile, outfile=None):
    if not outfile:
        outfile = tempfile.NamedTemporaryFile(
            suffix='.encrypt', dir=settings.FILE_UPLOAD_TEMP_DIR
        )
    nonce = os.urandom(13)
    inner_key = os.urandom(32)
    encryptor = Cipher(
        algorithms.AES(inner_key),
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
    return outfile, nonce, inner_key


def create_key_map(request, contents, keyset=None):
    if not keyset:
        keyset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
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
        group="key",
        source__in=contents
    )

    key_query = Content.objects.filter(
        info__tag="key",
        info__tag__in=key_map1.keys(),
        references__in=reference_query
    )
    key_map = {}
    for key in key_query:
        matching_key = key.info.filter(tag__in=key_map1.keys()).first()
        if not matching_key:
            continue
        graph = Graph()
        graph.parse(file=key.value, format="turtle")
        try:
            aesgcm = AESGCM(base64.b64decode(matching_key))
            privkey = aesgcm.decrypt(graph.value(
                predicate=sgraph_key["Key.encrypted_private_key"]
            ).toPython())
        except Exception as exc:
            logger.info("Could not decode private key", exc_info=exc)
            continue
        privkey = load_pem_private_key(privkey, None, default_backend())
        for ref in reference_query.filter(
            target=key
        ).only("extra", "source_id"):
            try:
                key_map[ref.source_id] = privkey.decrypt(
                    base64.b64decode(ref.extra),
                    default_padding
                )
            except Exception as exc:
                logger.warning("Could not decode shared key", exc_info=exc)
    return key_map
