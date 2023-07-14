__all__ = ["create_cluster_fn", "update_cluster_fn"]

import logging
from contextlib import nullcontext
from uuid import UUID, uuid4

import ratelimit
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import F
from django.utils import timezone

from ....core.exceptions import ResourceLimitExceeded
from ...models import Cluster, ClusterGroup, Net, SGroupProperty
from ...utils.auth import (
    fetch_by_id,
    get_cached_net_properties,
    get_cached_result,
    retrieve_allowed_objects,
)
from ._actions import manage_actions_fn
from ._arguments import ClusterInput, ContentInput
from ._contents import create_key_fn

logger = logging.getLogger(__name__)


def _update_or_create_cluster(request, cluster: Cluster, objdata, authset):
    create_cluster = not cluster.id
    size_new = 0
    size_old = cluster.size

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
        size_new += len(objdata.description) + Cluster.flexid_byte_size
        cluster.description = objdata.description
    else:
        size_new = size_old

    net = getattr(objdata, "net", None)
    old_net = None
    if not create_cluster:
        old_net = cluster.net
    manage = Cluster.objects.none()
    if create_cluster or objdata.primary or isinstance(net, str):
        manage = retrieve_allowed_objects(
            request,
            Cluster.objects.all(),
            scope="manage",
            authset=authset,
        )["objects_without_public"]
    if net:
        if isinstance(net, Net):
            cluster.net = net
        else:
            cluster.net = (
                fetch_by_id(
                    manage,
                    [net],
                    check_long=False,
                    check_short_id=True,
                    check_short_name=True,
                    limit_ids=None,
                )
                .get(primaryFor__isnull=False)
                .net
            )
    elif create_cluster:
        user = None

        if manage:
            net = manage.first().net
        if not net:
            if retrieve_allowed_objects(
                request,
                Cluster.objects.all(),
                scope="manage",
                authset=authset,
                ignore_restrictions=True,
            )["objects_without_public"].exists():
                raise ValueError(
                    "not allowed - net disabled or "
                    "not in actions time range"
                )
            user = getattr(request, "user", None)
            if user and not user.is_authenticated:
                user = None
            if user:
                net = Net.objects.filter(user_name=user.get_username()).first()
                if net and net.clusters.exists():
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
    create_net = not cluster.net.id
    if objdata.primary or not cluster.net.primaryCluster:
        if (
            cluster.net.primaryCluster
            and "manage_update"
            not in get_cached_net_properties(request, authset=authset)
        ):
            try:
                manage.get(id=cluster.net.primaryCluster.id)
            except ObjectDoesNotExist:
                raise ValueError("No permission to move primary mark")
        if old_net and old_net.primaryCluster == cluster:
            if objdata.primary:
                raise ValueError(
                    "Cannot transfer a cluster with primary mark between nets"
                )
            objdata.primary = False
        else:
            objdata.primary = True

    cluster.clean()
    assert size_new > 0, "Every cluster should have a size > 0"
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
        update_fields = None
        primary_updated = False
        if not create_net:
            update_fields = ["bytes_in_use", "last_used"]
        if update_fields and not create_cluster and objdata.primary:
            cluster.net.primaryCluster = cluster
            update_fields.append("primaryCluster")
            primary_updated = True

        # first net in case of net is not persisted yet
        cluster.net.save(update_fields=update_fields)
        # first net must be created
        if create_net:
            dProperty = SGroupProperty.objects.get_or_create(
                name="default", defaults={}
            )[0]
            cluster.net.groups.set(dProperty.netGroups.all())

        cluster.updateId = uuid4()
        cluster.save()
        # save only once
        if objdata.primary and not primary_updated:
            cluster.net.primaryCluster = cluster
            cluster.net.save(update_fields=["primaryCluster"])
        # only save a persisted old_net
        if old_net and old_net.id:
            # don't update last_used
            old_net.save(update_fields=["bytes_in_use"])
        if getattr(objdata, "groups", None) is not None:
            cluster.groups.set(
                ClusterGroup.objects.filter(name__in=objdata.groups)
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

        if create_cluster and "manage" not in action_save_fn.action_types:
            raise ValueError('Requires "manage" Action')

        def save_fn():
            cluster_save_fn()
            action_save_fn()
            return cluster

    elif not create_cluster:
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
