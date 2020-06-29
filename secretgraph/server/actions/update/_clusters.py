__all__ = ["create_cluster", "update_cluster"]

import os

from django.conf import settings
from django.core.files.base import ContentFile, File
from django.db import transaction
from rdflib import RDF, BNode, Graph

from ....constants import sgraph_cluster
from ....utils.misc import get_secrets, hash_object
from ...models import Cluster
from ._actions import create_actions_func
from ._contents import create_key_func

len_default_hash = len(hash_object(b""))


def _update_or_create_cluster(
    request, cluster, objdata, authset
):
    created = not cluster.id
    if objdata.get("publicInfo"):
        if isinstance(objdata["publicInfo"], bytes):
            objdata["publicInfo"] = \
                ContentFile(objdata["publicInfo"])
        elif isinstance(objdata["publicInfo"], str):
            objdata["publicInfo"] = \
                ContentFile(objdata["publicInfo"].encode("utf8"))
        else:
            objdata["publicInfo"] = \
                File(objdata["publicInfo"])
        # max = 2 MB
        if objdata["publicInfo"].size > 2000000:
            raise ValueError("Too big >2MB")
        g = Graph()
        g.parse(file=objdata["publicInfo"], format="turtle")
        public_secret_hashes = set(map(hash_object, get_secrets(g)))
        cluster.public = len(public_secret_hashes) > 0
        if created:
            def cluster_save_func():
                cluster.publicInfo.save("", objdata["publicInfo"])
        else:
            def cluster_save_func():
                cluster.publicInfo.delete(False)
                cluster.publicInfo.save("", objdata["publicInfo"])
    elif cluster.id is not None:
        public_secret_hashes = {}
        cluster_save_func = cluster.save
    else:
        raise ValueError("no public info")

    if objdata.get("actions"):
        action_save_func = create_actions_func(
            cluster, objdata["actions"], request, created, authset=authset
        )
        assert created and not cluster.id, \
            "Don't save cluster in action clean"

        m_actions = filter(
            lambda x: x.action_type == "manage", action_save_func.actions
        )
        m_actions = set(map(lambda x: x.keyHash, m_actions))

        if created and "manage" not in action_save_func.action_types:
            raise ValueError("Requires \"manage\" Action")

        if m_actions.intersection(public_secret_hashes):
            raise ValueError("\"manage\" action cannot be public")

        def save_func():
            cluster_save_func()
            action_save_func()
            return cluster
    elif cluster.id is not None and not public_secret_hashes:
        def save_func():
            cluster_save_func()
            return cluster
    else:
        raise ValueError("no actions for new cluster")
    return save_func


def create_cluster(
    request, objdata=None, user=None, authset=None
):
    prebuild = {}

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        if not user:
            raise ValueError("No user specified")
    if user:
        prebuild["user"] = user
    action_key = None
    if not objdata:
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
    if not objdata.get("publicInfo"):
        g = Graph()
        root = BNode()
        g.add((root, RDF.type, sgraph_cluster["Cluster"]))
        objdata["publicInfo"] = g.serialize(format="turtle")

    if not objdata.get("actions"):
        raise ValueError("Actions required")
    contentdata = {
        "key": objdata["key"]
    }
    cluster = Cluster(**prebuild)
    cluster_func = _update_or_create_cluster(
        request, cluster, objdata, authset
    )
    contentdata["cluster"] = cluster
    content_func = create_key_func(
        request, contentdata, authset
    )
    with transaction.atomic():
        cluster = cluster_func()
        content_func()

    return (
        cluster,
        action_key
    )


def update_cluster(request, cluster, objdata, user=None, authset=None):
    assert cluster.id
    if user:
        cluster.user = user

    return _update_or_create_cluster(
        request, cluster, objdata, authset=authset
    )()
