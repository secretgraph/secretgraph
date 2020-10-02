__all__ = ["create_cluster_fn", "update_cluster_fn"]

import os
from contextlib import nullcontext
from uuid import UUID, uuid4

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.core.files.base import ContentFile, File
from rdflib import RDF, BNode, Graph

from ....constants import sgraph_cluster
from ...utils.misc import get_secrets, hash_object
from ...models import Cluster
from ._actions import create_actions_fn
from ._contents import create_key_fn

len_default_hash = len(hash_object(b""))


def _update_or_create_cluster(
    request, cluster, objdata, authset
):
    created = not cluster.id
    if objdata.get("publicInfo"):
        if isinstance(objdata["publicInfo"], bytes):
            objdata["publicInfo"] = \
                ContentFile(objdata["publicInfo"], "publicInfo")
        elif isinstance(objdata["publicInfo"], str):
            objdata["publicInfo"] = \
                ContentFile(objdata["publicInfo"].encode("utf8"), "publicInfo")
        else:
            objdata["publicInfo"] = \
                File(objdata["publicInfo"], "publicInfo")
        # max = 2 MB
        if objdata["publicInfo"].size > 2000000:
            raise ValueError("Too big >2MB")
        g = Graph()
        g.parse(file=objdata["publicInfo"], format="turtle")
        public_secret_hashes = set(map(hash_object, get_secrets(g)))
        cluster.public = len(public_secret_hashes) > 0
        if created:
            def cluster_save_fn():
                cluster.updateId = uuid4()
                cluster.publicInfo.save("", objdata["publicInfo"])
        else:
            def cluster_save_fn():
                cluster.updateId = uuid4()
                cluster.publicInfo.delete(False)
                cluster.publicInfo.save("", objdata["publicInfo"])
    elif cluster.id is not None:
        public_secret_hashes = {}
        cluster_save_fn = cluster.save
    else:
        raise ValueError("no publicInfo")

    if objdata.get("actions"):
        action_save_fn = create_actions_fn(
            cluster, objdata["actions"], request, created, authset=authset
        )
        assert created and not cluster.id, \
            "Don't save cluster in action clean"

        m_actions = filter(
            lambda x: x.action_type == "manage", action_save_fn.actions
        )
        m_actions = set(map(lambda x: x.keyHash, m_actions))

        if created and "manage" not in action_save_fn.action_types:
            raise ValueError("Requires \"manage\" Action")

        if m_actions.intersection(public_secret_hashes):
            raise ValueError("\"manage\" action cannot be public")

        def save_fn():
            cluster_save_fn()
            action_save_fn()
            return cluster
    elif cluster.id is not None and not public_secret_hashes:
        def save_fn():
            cluster_save_fn()
            return cluster
    else:
        raise ValueError("no actions for new cluster")
    return save_fn


def create_cluster_fn(
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
    cluster_fn = _update_or_create_cluster(
        request, cluster, objdata, authset
    )
    contentdata["cluster"] = cluster
    content_fn = create_key_fn(
        request, contentdata, authset
    )

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            cluster = cluster_fn()
            content_fn()
            return {
                "cluster": cluster,
                "actionKey": action_key,
                "writeok": True
            }
    return save_fn


def update_cluster_fn(
    request, cluster, objdata, updateId, user=None, authset=None
):
    assert cluster.id
    try:
        updateId = UUID(updateId)
    except Exception:
        raise ValueError("updateId is not an uuid")
    if user:
        cluster.user = user

    cluster_fn = _update_or_create_cluster(
        request, cluster, objdata, authset=authset
    )

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            try:
                Cluster.objects.get(id=cluster.id, updateId=updateId)
            except ObjectDoesNotExist:
                return {
                    "cluster": Cluster.objects.filter(id=cluster.id).first(),
                    "writeok": False
                }
            return {
                "cluster": cluster_fn(),
                "writeok": True
            }
    return save_fn
