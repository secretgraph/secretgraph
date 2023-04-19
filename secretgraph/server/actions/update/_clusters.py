__all__ = ["create_cluster_fn", "update_cluster_fn"]

from contextlib import nullcontext
from uuid import UUID, uuid4
import logging

import ratelimit
from django.conf import settings
from django.utils import timezone
from django.db.models import F
from django.core.exceptions import ObjectDoesNotExist
from ....core.exceptions import ResourceLimitExceeded

from ...models import Cluster, Net, GlobalGroup
from ...utils.auth import (
    ids_to_results,
    retrieve_allowed_objects,
    get_cached_result,
)
from ._arguments import ContentInput, ClusterInput
from ._actions import manage_actions_fn
from ._contents import create_key_fn

logger = logging.getLogger(__name__)


def _update_or_create_cluster(request, cluster: Cluster, objdata, authset):
    create = not cluster.id
    size_new = 0
    size_old = 0

    if getattr(objdata, "name", None) is not None:
        if cluster.name != objdata.name:
            if objdata.name == "@system":
                raise ValueError("Invalid name")
            cluster.name = objdata.name
            if cluster.name.startswith("@"):
                cluster.globalNameRegisteredAt = timezone.now()
            else:
                cluster.globalNameRegisteredAt = None

    # not cleaned yet, so maybe globalNameRegisteredAt is incorrect
    if cluster.name.startswith("@"):
        if getattr(objdata, "featured", None) is not None:
            cluster.featured = bool(objdata.featured)

    if getattr(objdata, "description", None) is not None:
        size_old -= len(cluster.description)
        size_new += len(objdata.description)
        cluster.description = objdata.description

    net = getattr(objdata, "net", None)
    old_net = None
    if not create:
        old_net = cluster.net
    if net:
        if isinstance(net, Net):
            cluster.net = net
        else:
            net_result = ids_to_results(
                request,
                [net],
                Cluster,
                "manage",
                authset=authset,
            )["Cluster"]
            cluster.net = net_result["objects"].get().net
    elif create:
        user = None
        manage = retrieve_allowed_objects(
            request,
            Cluster.objects.all(),
            scope="manage",
            authset=authset,
        )["objects"]
        if manage:
            net = manage.first().net
        if not net:
            if retrieve_allowed_objects(
                request,
                Cluster.objects.all(),
                scope="manage",
                authset=authset,
                ignore_restrictions=True,
            )["objects"].exists():
                raise ValueError(
                    "not allowed - net disabled or "
                    "not in actions time range"
                )
            user = getattr(request, "user", None)
            if user and not user.is_authenticated:
                user = None
            if user:
                net = Net.objects.filter(user_name=user.get_username()).first()
                if net.clusters.exists():
                    logger.info(
                        "User '%s' has already registered some cluster, "
                        "but doesn't use them for registering new ones. "
                        "He may has trouble.",
                        user.get_username(),
                    )
            else:
                if getattr(settings, "SECRETGRAPH_REQUIRE_USER", False):
                    raise ValueError("Must be logged in")
                elif not getattr(
                    settings, "SECRETGRAPH_ALLOW_REGISTER", False
                ):
                    raise ValueError("Cannot register")
        if not net:
            if not user:
                rate = settings.SECRETGRAPH_RATELIMITS.get(
                    "ANONYMOUS_REGISTER"
                )
                if rate:
                    r = ratelimit.get_ratelimit(
                        key="ip",
                        rate=rate,
                        request=request,
                        group="anonymous_register",
                        action=ratelimit.Action.INCREASE,
                    )
                    if r.request_limit >= 1:
                        raise ratelimit.RatelimitExceeded(
                            r,
                            "too many attaempts to register from ip",
                        )
            net = Net()
            if user:
                net.user_name = user.get_username()
            net.reset_quota()
            net.reset_max_upload_size()
        cluster.net = net
        del user
    if old_net == cluster.net:
        old_net = None
    # cleanup after scope
    del net

    cluster.clean()
    if old_net is None:
        size_diff = size_new - size_old
        if (
            cluster.net.quota is not None
            and size_diff > 0
            and cluster.net.bytes_in_use + size_diff > cluster.net.quota
        ):
            raise ResourceLimitExceeded("quota exceeded")
        # still in memory not serialized to db
        if not cluster.net.id:
            cluster.net.bytes_in_use += size_diff
        else:
            cluster.net.bytes_in_use = F("bytes_in_use") + size_diff
    else:
        if (
            cluster.net.quota is not None
            and size_new > 0
            and cluster.net.bytes_in_use + size_new > cluster.net.quota
        ):
            raise ResourceLimitExceeded("quota exceeded")
        # still in memory not serialized to db
        if not cluster.net.id:
            cluster.net.bytes_in_use += size_new
        else:
            cluster.net.bytes_in_use = F("bytes_in_use") + size_new

        if not old_net.id:
            old_net.bytes_in_use -= size_old
        else:
            old_net.bytes_in_use = F("bytes_in_use") - size_old
    cluster.net.last_used = timezone.now()

    def cluster_save_fn():
        # first net in case of net is not persisted yet
        cluster.net.save(
            update_fields=["bytes_in_use", "last_used"]
            if cluster.net.id
            else None
        )
        cluster.updateId = uuid4()
        cluster.save()
        # only save a persisted old_net
        if old_net and old_net.id:
            # don't update last_used
            old_net.save(update_fields=["bytes_in_use"])
        if getattr(objdata, "groups", None) is not None:
            cluster.groups.set(
                GlobalGroup.objects.filter(name__in=objdata.groups)
            )

    # path: actions are specified
    if getattr(objdata, "actions", None) is not None:
        action_save_fn = manage_actions_fn(
            request, cluster, objdata.actions, authset=authset
        )

        m_actions = filter(
            lambda x: x.action_type == "manage", action_save_fn.actions
        )
        m_actions = set(map(lambda x: x.keyHash, m_actions))

        if create and "manage" not in action_save_fn.action_types:
            raise ValueError('Requires "manage" Action')

        def save_fn():
            cluster_save_fn()
            action_save_fn()
            return cluster

    elif not create:
        # path: actions are not specified but cluster exists and no
        # new public_secret_hashes
        def save_fn():
            cluster_save_fn()
            return cluster

    else:
        raise ValueError("no actions for new cluster")
    return save_fn


def create_cluster_fn(request, objdata: ClusterInput, authset=None):
    if not getattr(objdata, "actions", None):
        raise ValueError("Actions required")
    cluster = Cluster()
    cluster_fn = _update_or_create_cluster(request, cluster, objdata, authset)
    content_fns = []
    if objdata.keys:
        for key_ob in objdata.keys[:2]:
            contentdata = ContentInput(key=key_ob, cluster=cluster)
            content_fns.append(
                create_key_fn(request, contentdata, authset=authset)
            )

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            cluster = cluster_fn()
            # refresh_fields(add_actions, "cluster")
            result_cache = get_cached_result(request, authset=authset)
            for fn in content_fns:
                fn()
                result_cache.refresh("Content")
            return {"cluster": cluster, "writeok": True}

    return save_fn


def update_cluster_fn(request, cluster, objdata, updateId, authset=None):
    assert cluster.id
    if not isinstance(updateId, UUID):
        try:
            updateId = UUID(updateId)
        except Exception:
            raise ValueError("updateId is not an uuid")

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
