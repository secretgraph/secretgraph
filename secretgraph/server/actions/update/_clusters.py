__all__ = ["create_cluster_fn", "update_cluster_fn"]

from contextlib import nullcontext
from uuid import UUID, uuid4

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist

from ...models import Cluster, Net
from ...utils.auth import fetch_by_id, ids_to_results, retrieve_allowed_objects
from ...utils.misc import hash_object
from ._actions import manage_actions_fn
from ._contents import create_key_fn

len_default_hash = len(hash_object(b""))


def _update_or_create_cluster(request, cluster, objdata, authset):
    created = not cluster.id

    if "public" in objdata:
        cluster.public = bool(objdata["public"])
    if "featured" in objdata:
        cluster.featured = bool(objdata["featured"])

    if "name" in objdata:
        cluster.name = objdata["name"] or ""

    if "description" in objdata:
        cluster.description = objdata["description"] or ""

    def cluster_save_fn():
        cluster.updateId = uuid4()
        cluster.save()
        if "groups" in objdata:
            cluster.groups.set(objdata["groups"])

    # path: actions are specified
    if objdata.get("actions"):
        action_save_fn = manage_actions_fn(
            request, cluster, objdata["actions"], authset=authset
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


def create_cluster_fn(request, objdata, authset=None):
    net = objdata.get("net")
    if not isinstance(net, Net):
        manage = retrieve_allowed_objects(
            request,
            Cluster.objects.all(),
            scope="manage",
            authset=authset,
        )
        if manage:
            if objdata.get("net"):
                net = fetch_by_id(manage, objdata.get("net")).first().net
            else:
                net = manage.first().net
        if not net:
            user = None
            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                user = getattr(request, "user", None)
                if not user or not user.is_authenticated:
                    raise ValueError("Must be logged in")
                net = user.secretgraph_net
            elif not getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False):
                raise ValueError("Cannot register new cluster")
            if not net:
                net = Net()
                if user:
                    net.user = user
                net.reset_quota()
                net.reset_max_upload_size()
    prebuild = {"net": net}

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


def update_cluster_fn(request, cluster, objdata, updateId, authset=None):
    assert cluster.id
    try:
        updateId = UUID(updateId)
    except Exception:
        raise ValueError("updateId is not an uuid")

    net = objdata.get("net")
    if net:
        if isinstance(net, Net):
            cluster.net = net
        else:
            net_result = ids_to_results(
                request,
                objdata.get("net"),
                Cluster,
                "manage",
                authset=authset,
            )["Cluster"]
            cluster.net = net_result["objects"].get().net

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
