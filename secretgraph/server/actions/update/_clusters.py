__all__ = ["create_cluster", "update_cluster"]

import base64
import hashlib
import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.db import transaction
from graphql_relay import from_global_id
from rdflib import RDF, XSD, BNode, Graph, Literal

from ....constants import sgraph_cluster
from ...models import Cluster
from ...utils.auth import retrieve_allowed_objects
from ...utils.misc import get_secrets, hash_object
from ._actions import create_actions_func
from ._contents import create_key_func

len_default_hash = len(hash_object(b""))


def _update_or_create_cluster(
    request, cluster, objdata
):
    if objdata.get("public_info"):
        g = Graph()
        g.parse(objdata["public_info"], "turtle")
        public_secret_hashes = set(map(hash_object, get_secrets(g)[0]))
        cluster.public_info = objdata["public_info"]
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
    request, objdata=None, key=None, pw=None, user=None, authset=None
):
    prebuild = {}

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        if not user:
            raise ValueError("No user specified")
    if user:
        prebuild["user"] = user
    action_key = None
    private_key = None
    if not objdata.get("key"):
        if not key:
            key = os.urandom(32)
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
        if pw:
            salt = os.urandom(16)
            hashed_pw = hashlib.pbkdf2_hmac(
                'sha256', pw.encode("utf8"), salt, 250000
            )
            aesgcm = AESGCM(hashed_pw)

            b2 = BNode()
            g.add((root, sgraph_cluster["Cluster.boxes"], b2))
            g.add((
                b2,
                sgraph_cluster["Cluster.tasks"],
                Literal(f"pw:{salt}", datatype=XSD.string)
            ))
            for k, ktype in [(action_key, b"manage"), (key, b"")]:
                if not k:
                    continue
                nonce = os.urandom(13)

                encrypted_secret = aesgcm.encrypt(
                    b"%b:%b" % (
                        ktype,
                        base64.b64encode(k)
                    ), nonce, None
                )
                encrypted_secret = "{}:{}".format(
                    base64.b64encode(nonce).decode("ascii"),
                    base64.b64encode(encrypted_secret).decode("ascii")
                )
                g.add((
                    b2,
                    sgraph_cluster["Cluster.secrets"],
                    Literal(encrypted_secret, datatype=XSD.string)
                ))
        objdata["public_info"] = g.serialize(format="turtle")

    if not objdata.get("actions"):
        raise ValueError("Actions required")
    contentdata = {}
    if not objdata.get("key"):
        aesgcm = AESGCM(key)
        nonce = os.urandom(13)
        private_key = generate_private_key(
            public_exponent=65537,
            key_size=4096,
            backend=default_backend()
        )
        contentdata["key"] = {
            "nonce": nonce,
            "private_key": aesgcm.encrypt(
                private_key.private_bytes(
                    encoding=serialization.Encoding.DER,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption()
                ),
                nonce,
                None
            ),
            "public_key": private_key.public_bytes(
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
        private_key,
        key
    )


def update_cluster(request, cluster, objdata, user=None):
    if isinstance(cluster, str):
        type_name, flexid = from_global_id(cluster)
        if type_name != "Cluster":
            raise ValueError("Only for Clusters")
        result = retrieve_allowed_objects(
            request, "update", Cluster.objects.all()
        )
        cluster = result["objects"].get(flexid=flexid)
    assert cluster.id
    if user:
        cluster.user = user

    return _update_or_create_cluster(
        request, cluster, objdata
    )()
