__all__ = ["create_cluster_fn", "update_cluster_fn"]

import os
from contextlib import nullcontext
from uuid import UUID, uuid4

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist

from ...utils.misc import hash_object
from ...models import Cluster
from ._actions import manage_actions_fn
from ._contents import create_key_fn

len_default_hash = len(hash_object(b""))


def _update_or_create_cluster(request, cluster, objdata, authset):
    created = not cluster.id

    if "public" in objdata:
        cluster.public = bool(objdata["public"])
    if "featured" in objdata:
        cluster.featured = bool(objdata["featured"])

    if "description" in objdata:
        cluster.description = objdata["description"] or ""

    def cluster_save_fn():
        cluster.updateId = uuid4()
        cluster.save()

    # path: actions are specified
    if objdata.get("actions"):
        action_save_fn = manage_actions_fn(
            cluster, objdata["actions"], request, authset=authset
        )

        m_actions = filter(
            lambda x: x.action_type == "manage", action_save_fn.actions
        )
        m_actions = set(map(lambda x: x.keyHash, m_actions))

        if created and "manage" not in action_save_fn.action_types:
            raise ValueError('Requires "manage" Action')

        def save_fn():
            cluster_save_fn()
            action_save_fn()
            return cluster

    elif not created:
        # path: actions are not specified but cluster exists and no
        # new public_secret_hashes
        def save_fn():
            cluster_save_fn()
            return cluster

    else:
        raise ValueError("no actions for new cluster")
    return save_fn


def create_cluster_fn(request, objdata=None, user=None, authset=None):
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
            "actions": [{"key": action_key, "value": {"action": "manage"}}]
        }

    if not objdata.get("actions"):
        raise ValueError("Actions required")
    contentdata = {"key": objdata["key"]}
    cluster = Cluster(**prebuild)
    cluster_fn = _update_or_create_cluster(request, cluster, objdata, authset)
    contentdata["cluster"] = cluster
    content_fn = create_key_fn(request, contentdata, authset=authset)

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            cluster = cluster_fn()
            # refresh_fields(add_actions, "cluster")
            content_fn()
            return {"cluster": cluster, "writeok": True}

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
                    "writeok": False,
                }
            return {"cluster": cluster_fn(), "writeok": True}

    return save_fn
