
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import (
    load_pem_private_key
)
from rdflib import Graph

from ..constants import sgraph_key
from ..models import Content, ContentReference


def create_key_map(request, contents, keyset=None):
    if not keyset:
        keyset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
    key_map1 = {}
    for i in keyset:
        i = i.split(":", 1)
        if len(i) == 2:
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
        matching_hash_key = None
        for h in key.info.filter(tag__startswith="key_hash=").values_list(
            "tag", flat=True
        ):
            if h in key_map1:
                matching_hash_key = (h.split("=", 1)[-1], key_map1[h])
        graph = Graph()
        graph.parse(file=key.value, format="turtle")
        aesgcm = AESGCM(matching_hash_key[1])
        privkey = aesgcm.decrypt(graph.value(
            predicate=sgraph_key["Key.encrypted_private_key"]
        ).toPython())
        privkey = load_pem_private_key(privkey, None, default_backend())
        for ref in reference_query.filter(target=key):
