__all__ = ["create_cluster_fn", "update_cluster_fn"]

import logging
from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from typing import TypedDict
from uuid import UUID, uuid4

import django_fast_ratelimit as ratelimit
from asgiref.sync import sync_to_async
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import F
from django.utils import timezone
from strawberry_django import django_resolver

from ....core import constants
from ....core.exceptions import ResourceLimitExceeded
from ...models import Cluster, ClusterGroup, Net, NetGroup, SGroupProperty
from ...utils.auth import (
    aget_user,
    ain_cached_net_properties_or_user_special,
    fetch_by_id,
    get_cached_result,
    retrieve_allowed_objects,
)
from ._actions import manage_actions_fn
from ._arguments import ClusterInput, ContentInput
from ._contents import create_key_fn
from ._groups import apply_groups, calculate_groups

logger = logging.getLogger(__name__)


class Result(TypedDict):
    cluster: Cluster
    writeok: bool


async def _update_or_create_cluster(
    request, cluster: Cluster, objdata: ClusterInput, authset
):
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

    net = objdata.net
    old_net = None
    old_net_primary_updated = False
    if not create_cluster:
        old_net = cluster.net
    manage = Cluster.objects.none()
    # predefine manage query
    if (
        create_cluster
        or objdata.primary
        or objdata.clusterGroups
        or objdata.netGroups
        or isinstance(net, str)
    ):
        manage = (
            await retrieve_allowed_objects(
                request,
                "Cluster",
                scope="manage",
                authset=authset,
            )
        )["objects_without_public"]
    # set net explicitly
    if net:
        if isinstance(net, Net):
            cluster.net = net
        else:
            cluster.net = await (
                fetch_by_id(
                    manage,
                    [net],
                    check_long=False,
                    check_short_id=True,
                    check_short_name=True,
                    limit_ids=None,
                ).aget()
            ).net
            # for transfering cluster with primary mark
            if old_net and old_net != net and old_net.primaryCluster == cluster:
                old_net.primaryCluster = None
                old_net_primary_updated = True
    elif create_cluster:
        user = None

        if manage:
            net_cluster = await manage.afirst()
            if net_cluster:
                net = net_cluster.net
            del net_cluster
        # fallback if no net was provided
        if not net:
            # check if the tokens provided are valid
            # TODO: provide a simpler method
            if (
                authset
                and await (
                    await retrieve_allowed_objects(
                        request,
                        "Cluster",
                        scope="manage",
                        authset=authset,
                        ignore_restrictions=True,
                    )
                )["objects_without_public"].aexists()
            ):
                raise ValueError(
                    "not allowed - net disabled or not in actions time range"
                )
            # use user
            user = await aget_user(request)
            if user:
                username = user.get_username()
                net = await Net.objects.filter(user_name=username).afirst()
                if net and await net.clusters.aexists():
                    logger.info(
                        "User '%s' has already registered some cluster, "
                        "but doesn't use them for registering new ones. "
                        "He may has trouble.",
                        username,
                    )
            else:
                if getattr(settings, "SECRETGRAPH_REQUIRE_USER", False):
                    raise ValueError("Must be logged in")
                elif not getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False):
                    raise ValueError("Cannot register")
        # no net could be retrieved from user (not initialized?)
        if not net:
            # no user was found
            if not user:
                rate = settings.SECRETGRAPH_RATELIMITS.get("ANONYMOUS_REGISTER")
                if rate:
                    r = await ratelimit.aget_ratelimit(
                        request=request,
                        group="secretgraph_anonymous_register",
                        key="ip"
                        if rate != "iprestrict"
                        else "django_fast_iprestrict.apply_ratelimit:ignore_pathes",
                        rate=rate if rate != "iprestrict" else None,
                        action=ratelimit.Action.INCREASE,
                    )
                    if r.request_limit >= 1:
                        raise ratelimit.RatelimitExceeded(
                            "too many attempts to register from ip",
                            ratelimit=r,
                        )
            # now create a new net with username
            net = Net()
            if user:
                net.user_name = user.get_username()

            net.reset_quota()
            net.reset_max_upload_size()
        cluster.net = net
        del user
    # set old_net to None if the same as net
    if old_net == cluster.net:
        old_net = None
    # cleanup after scope
    del net
    create_net = not cluster.net.id
    # check primary flag permissions
    if objdata.primary and not create_net and cluster.net.primaryCluster_id:
        # has superuser permission, has manage_update permission or is logged in as user
        if await ain_cached_net_properties_or_user_special(
            request, "manage_update", check_net=cluster.net, ensureInitialized=True
        ):
            try:
                await manage.aget(id=cluster.net.primaryCluster_id)
            except ObjectDoesNotExist:
                raise ValueError("No permission to move primary mark")
    await sync_to_async(cluster.full_clean)(["net"])
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
    clusterGroups_qtuple = None
    if getattr(objdata, "clusterGroups", None) is not None:
        clusterGroups_qtuple = calculate_groups(
            ClusterGroup,
            groups=objdata.clusterGroups,
            operation=constants.MetadataOperations.REPLACE,
            admin=await ain_cached_net_properties_or_user_special(
                request, "manage_cluster_groups", ensureInitialized=True
            ),
            initial=create_cluster,
        )
        assert isinstance(clusterGroups_qtuple, tuple)
    netGroups_qtuple = None
    if getattr(objdata, "netGroups", None) is not None:
        netGroups_qtuple = calculate_groups(
            NetGroup,
            groups=objdata.netGroups,
            operation=constants.MetadataOperations.REPLACE,
            admin=await ain_cached_net_properties_or_user_special(
                request, "manage_net_groups", ensureInitialized=True
            ),
            initial=create_net,
        )
        assert isinstance(clusterGroups_qtuple, tuple)
    dProperty = (
        await SGroupProperty.objects.aget_or_create(name="default", defaults={})
    )[0]

    def cluster_save_fn():
        update_net_fields = None
        primary_updated = False
        if not create_net:
            update_net_fields = ["bytes_in_use", "last_used"]
        if update_net_fields and not create_cluster and objdata.primary is not None:
            cluster.net.primaryCluster = cluster if objdata.primary else None
            update_net_fields.append("primaryCluster")
            primary_updated = True

        # first net in case of net is not persisted yet
        cluster.net.save(update_fields=update_net_fields)
        # first net must be created
        if create_net:
            cluster.net.groups.set(dProperty.netGroups.all())
        # replace works different here than just set, so put it after setting initial groups
        apply_groups(
            cluster.net,
            netGroups_qtuple,
            operation=constants.MetadataOperations.REPLACE,
        )

        cluster.updateId = uuid4()
        cluster.save()
        if create_cluster:
            cluster.groups.set(dProperty.clusterGroups.all())
        # replace works different here than just set, so put it after setting initial groups
        apply_groups(
            cluster,
            clusterGroups_qtuple,
            operation=constants.MetadataOperations.REPLACE,
        )

        # save only once
        if objdata.primary is not None and not primary_updated:
            cluster.net.primaryCluster = cluster if objdata.primary else None
            cluster.net.save(update_fields=["primaryCluster"])
        # only save a persisted old_net
        if old_net and old_net.id:
            fields = ["bytes_in_use"]
            if old_net_primary_updated:
                fields.append("primaryCluster")
            # don't update last_used
            old_net.save(update_fields=fields)

    # path: actions are specified
    if getattr(objdata, "actions", None) is not None:
        action_save_fn = await manage_actions_fn(
            request,
            cluster,
            objdata.actions,
            authset=authset,
        )

        m_actions = filter(lambda x: x.action_type == "manage", action_save_fn.actions)
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


async def create_cluster_fn(
    request, objdata: ClusterInput, authset=None
) -> Callable[[AbstractContextManager], Result]:
    if not getattr(objdata, "actions", None):
        raise ValueError('Requires "manage" Action - no actions found')
    cluster = Cluster()
    cluster_fn = await _update_or_create_cluster(request, cluster, objdata, authset)
    content_fns = []
    if objdata.keys:
        for key_ob in objdata.keys[:2]:
            contentdata = ContentInput(key=key_ob, cluster=cluster)
            content_fns.append(
                await create_key_fn(request, contentdata, authset=authset)
            )

    @django_resolver
    def save_fn(context: AbstractContextManager = nullcontext):
        if callable(context):
            context = context()
        with context:
            cluster = cluster_fn()
            # refresh_fields(add_actions, "cluster")
            result_cache = get_cached_result(request, authset=authset)
            for fn in content_fns:
                fn()
                result_cache.refresh("Content")
            return Result(cluster=cluster, writeok=True)

    return save_fn


async def update_cluster_fn(request, cluster, objdata, updateId, authset=None):
    assert cluster.id
    if not isinstance(updateId, UUID):
        try:
            updateId = UUID(updateId)
        except Exception:
            raise ValueError("updateId is not an uuid")

    cluster_fn = await _update_or_create_cluster(
        request, cluster, objdata, authset=authset
    )

    @django_resolver
    def save_fn(
        context: AbstractContextManager = nullcontext,
    ) -> Callable[[AbstractContextManager], Result]:
        if callable(context):
            context = context()
        with context:
            try:
                Cluster.objects.get(id=cluster.id, updateId=updateId)
            except ObjectDoesNotExist:
                return Result(
                    cluster=Cluster.objects.filter(id=cluster.id).first(),
                    writeok=False,
                )
            return Result(cluster=cluster_fn(), writeok=True)

    return save_fn
