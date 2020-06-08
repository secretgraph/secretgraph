__all__ = ["create_cluster", "update_cluster"]

import base64
import os
import hashlib

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.db import transaction
from rdflib import RDF, BNode, Graph

from ....constants import sgraph_cluster
from ....utils.misc import get_secrets, hash_object
from ...models import Cluster
from ._actions import create_actions_func
from ._contents import create_key_func

len_default_hash = len(hash_object(b""))


def _update_or_create_cluster(
    request, cluster, objdata
):
    if objdata.get("publicInfo"):
        g = Graph()
        g.parse(objdata["publicInfo"], "turtle")
        public_secret_hashes = set(map(hash_object, get_secrets(g)))
        cluster.publicInfo = objdata["publicInfo"]
        cluster.public = len(public_secret_hashes) > 0
    elif cluster.id is not None:
        public_secret_hashes = {}
    else:
        raise ValueError("no public info")

    if objdata.get("actions"):
        created = not cluster.id
        action_save_func = create_actions_func(
            cluster, objdata["actions"], request, created
        )
        assert created and not cluster.id, \
            "Don't save cluster in action clean"

        m_actions = filter(
            lambda x: x.action_type == "manage", action_save_func.actions
        )
        m_actions = set(map(lambda x: x.key_hash, m_actions))

        if created and "manage" not in action_save_func.action_types:
            raise ValueError("Requires \"manage\" Action")

        if m_actions.intersection(public_secret_hashes):
            raise ValueError("\"manage\" action cannot be public")

        def save_func():
            cluster.save()
            action_save_func()
            return cluster
    elif cluster.id is not None and not public_secret_hashes:
        def save_func():
            cluster.save()
            return cluster
    else:
        raise ValueError("no actions for new cluster")
    return save_func


def create_cluster(
    request, objdata=None, key=None, user=None, authset=None
):
    prebuild = {}

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        if not user:
            raise ValueError("No user specified")
    if user:
        prebuild["user"] = user
    action_key = None
    # no public key is set
    if not objdata.get("key"):
        if not key:
            key = os.urandom(32)
    if isinstance(key, str):
        key = base64.b64decode(key)
    if not isinstance(objdata, dict):
        action_key = os.urandom(32)
        objdata = {
            "actions": [
                {
                    "key": action_key,
                    "value": {
                        "action": "manage"
                    }
                }
            ]
        }
        g = Graph()
        root = BNode()
        g.add((root, RDF.type, sgraph_cluster["Cluster"]))
        objdata["publicInfo"] = g.serialize(format="turtle")

    if not objdata.get("actions"):
        raise ValueError("Actions required")
    contentdata = {}
    if not objdata.get("key"):
        nonce = os.urandom(13)
        derivedKey = hashlib.pbkdf2_hmac(
            "sha512",
            key,
            nonce,
            iterations=settings.SECRETGRAPH_ITERATIONS[0],
            dklen=32
        )
        aesgcm = AESGCM(derivedKey)
        privateKey = generate_private_key(
            public_exponent=65537,
            key_size=4096,
            backend=default_backend()
        )
        contentdata["key"] = {
            "nonce": nonce,
            "privateKey": aesgcm.encrypt(
                privateKey.private_bytes(
                    encoding=serialization.Encoding.DER,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption()
                ),
                nonce,
                None
            ),
            "publicKey": privateKey.public_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
                encryption_algorithm=serialization.NoEncryption()
            )
        }

    else:
        contentdata["key"] = objdata["key"]
    cluster = Cluster(**prebuild)
    cluster_func = _update_or_create_cluster(
        request, cluster, objdata
    )
    contentdata["cluster"] = cluster
    content_func = create_key_func(
        request, contentdata, key=key, authset=authset
    )
    with transaction.atomic():
        content_func()
        cluster = cluster_func()

    return (
        cluster,
        action_key,
        privateKey,
        key
    )


def update_cluster(request, cluster, objdata, user=None):
    assert cluster.id
    if user:
        cluster.user = user

    return _update_or_create_cluster(
        request, cluster, objdata
    )()
