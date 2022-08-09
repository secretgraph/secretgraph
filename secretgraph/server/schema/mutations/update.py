from __future__ import annotations

import logging
from typing import Optional
from dataclasses import asdict

import strawberry
from strawberry.types import Info
from strawberry_django_plus import relay
from django.conf import settings
from django.db import transaction

from ...actions.update import (
    create_cluster_fn,
    create_content_fn,
    update_cluster_fn,
    update_content_fn,
)
from ...models import Cluster, Content, GlobalGroupProperty, GlobalGroup, Net
from ...utils.auth import (
    fetch_by_id,
    ids_to_results,
    get_cached_result,
    get_cached_permissions,
    retrieve_allowed_objects,
)
from ..arguments import (
    AuthList,
    ClusterInput,
    ContentInput,
)
from ...utils.arguments import pre_clean_content_spec
from ..definitions import ClusterNode, ContentNode

logger = logging.getLogger(__name__)


@strawberry.type()
class ClusterMutation:
    cluster: ClusterNode
    writeok: bool


def mutate_cluster(
    info: Info,
    cluster: ClusterInput,
    id: Optional[relay.GlobalID] = None,
    updateId: Optional[strawberry.ID] = None,
    authorization: Optional[AuthList] = None,
) -> ClusterMutation:
    cluster = asdict(cluster)
    manage = retrieve_allowed_objects(
        info.context.request,
        Cluster.objects.all(),
        scope="manage",
        authset=authorization,
    )
    if cluster.get("featured") is not None:
        if not get_cached_permissions(
            info.context.request, authset=authorization
        )["manage_featured"]:
            del cluster["featured"]

    if cluster.get("groups") is not None:
        if get_cached_permissions(info.context.request, authset=authorization)[
            "manage_groups"
        ]:
            cluster["groups"] = GlobalGroup.objects.filter(
                name__in=cluster["groups"]
            )
        else:
            del cluster["groups"]
    if id:
        if not updateId:
            raise ValueError("updateId required")
        result = ids_to_results(
            info.context.request,
            str(id),
            Cluster,
            "update",
            authset=authorization,
        )["Cluster"]
        cluster_obj = result["objects"].first()
        if not cluster_obj:
            raise ValueError("No cluster found")
        _cluster_res = update_cluster_fn(
            info.context.request,
            cluster_obj,
            cluster,
            updateId,
            authset=authorization,
        )(transaction.atomic)
    else:
        net = None
        if manage:
            if cluster.get("net"):
                net = fetch_by_id(manage, cluster.get("net")).first().net
            else:
                net = manage.first().net
        if not net:
            user = None
            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                user = getattr(info.context.request, "user", None)
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
        cluster["groups"] = GlobalGroupProperty.objects.get_or_create(
            name="default", defaults={}
        )[0].groups.all()
        _cluster_res = create_cluster_fn(
            info.context.request, cluster, net=net, authset=authorization
        )(transaction.atomic)
    f = get_cached_result(info.context.request, authset=authorization)
    f["Content"]
    f["Cluster"]
    return ClusterMutation(**_cluster_res)


@strawberry.type()
class ContentMutation:

    content: ContentNode
    writeok: bool


def mutate_content(
    info: Info,
    content: ContentInput,
    id: Optional[relay.GlobalID] = None,
    updateId: Optional[strawberry.ID] = None,
    authorization: Optional[AuthList] = None,
) -> ContentMutation:
    content = asdict(content)
    required_keys = set()
    if id:
        if not updateId:
            raise ValueError("updateId required")
        result = ids_to_results(
            info.context.request,
            str(id),
            Content,
            "update",
            authset=authorization,
        )["Content"]
        content_obj = result["objects"].first()
        if not content_obj:
            raise ValueError()

        if content.get("value"):
            if content.get("cluster"):
                clusterObj = fetch_by_id(
                    Cluster.objects.all(), [content["cluster"]]
                ).first()
                if clusterObj:
                    required_keys = Content.objects.required_keys_full(
                        clusterObj
                    )
                else:
                    raise ValueError("cluster not found")
            else:
                required_keys = Content.objects.required_keys_full(clusterObj)
            required_keys = set(
                required_keys.values_list("contentHash", flat=True)
            )
        pre_clean_content_spec(False, content, result)

        returnval = ContentMutation(
            **update_content_fn(
                info.context.request,
                content_obj,
                content,
                updateId=updateId,
                required_keys=required_keys,
                authset=authorization,
            )(transaction.atomic)
        )
    else:
        result = ids_to_results(
            info.context.request,
            content["cluster"],
            Cluster,
            "create",
            authset=authorization,
        )["Cluster"]
        cluster_obj = result["objects"].first()
        if not cluster_obj:
            raise ValueError("Cluster for Content not found")

        # is a key spec
        if not content["key"]:
            required_keys = set(
                Content.objects.required_keys_full(cluster_obj).values_list(
                    "contentHash", flat=True
                )
            )
        pre_clean_content_spec(True, content, result)

        returnval = ContentMutation(
            **create_content_fn(
                info.context.request,
                content,
                required_keys=required_keys,
                authset=authorization,
            )(transaction.atomic)
        )
    f = get_cached_result(info.context.request, authset=authorization)
    f["Content"]
    f["Cluster"]
    return returnval
