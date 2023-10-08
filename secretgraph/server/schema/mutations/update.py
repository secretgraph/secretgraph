import logging
from typing import Optional

import strawberry
from django.db import transaction
from django.db.models import QuerySet
from django.db.models.functions import Substr
from strawberry import relay
from strawberry.types import Info
from strawberry_django import django_resolver

from ...actions.update import (
    create_cluster_fn,
    create_content_fn,
    update_cluster_fn,
    update_content_fn,
)
from ...models import Cluster, Content, SGroupProperty
from ...utils.arguments import pre_clean_content_spec
from ...utils.auth import (
    fetch_by_id,
    get_cached_net_properties,
    get_cached_result,
    ids_to_results,
    update_cached_net_properties,
)
from ..arguments import AuthList, ClusterInput, ContentInput
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
    if cluster.featured is not None:
        if "allow_featured" not in get_cached_net_properties(
            info.context["request"], authset=authorization
        ):
            cluster.featured = None

    if id:
        if not updateId:
            raise ValueError("updateId required")
        result = ids_to_results(
            info.context["request"],
            str(id),
            Cluster,
            scope="update",
            authset=authorization,
            cacheName=None,
        )["Cluster"]
        cluster_obj = result["objects_without_public"].get()
        if cluster.name is not None and cluster.name.startswith("@"):
            if (
                "allow_global_name"
                not in (
                    get_cached_net_properties(
                        info.context["request"], authset=authorization
                    )
                )
                and not cluster_obj.groups.filter(
                    properties__name="allow_global_name"
                ).exists()
            ):
                cluster.name = f"+@{cluster.name}"
        _cluster_res = update_cluster_fn(
            info.context["request"],
            cluster_obj,
            cluster,
            updateId,
            authset=authorization,
        )(transaction.atomic)
    else:
        if cluster.clusterGroups is None:
            dProperty = SGroupProperty.objects.get_or_create(
                name="default", defaults={}
            )[0]
            get_cached_net_properties(
                info.context["request"], authset=authorization
            )
            update_cached_net_properties(
                info.context["request"], groups=dProperty.netGroups.all()
            )

            if cluster.name is not None and cluster.name.startswith("@"):
                if (
                    "allow_global_name"
                    not in (
                        get_cached_net_properties(
                            info.context["request"], authset=authorization
                        )
                    )
                    and not SGroupProperty.objects.defaultClusterProperties()
                    .filter(name="allow_global_name")
                    .exists()
                ):
                    cluster.name = f"+@{cluster.name}"
        _cluster_res = create_cluster_fn(
            info.context["request"], cluster, authset=authorization
        )(transaction.atomic)
    f = get_cached_result(info.context["request"], authset=authorization)
    f.preinit("Content", "Cluster")
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
    required_keys = set()
    if id:
        if not updateId:
            raise ValueError("updateId required")
        result = ids_to_results(
            info.context["request"],
            id,
            Content,
            scope="update",
            authset=authorization,
            cacheName=None,
        )["Content"]
        # allow admin updates
        if "manage_update" in get_cached_net_properties(
            info.context["request"]
        ):
            content_obj = Content.objects.filter(locked__isnull=True).get()

        else:
            content_obj = (
                result["objects_without_public"]
                .filter(locked__isnull=True)
                .get()
            )
        if content.hidden is not None:
            if (
                "allow_hidden"
                not in get_cached_net_properties(
                    info.context["request"], authset=authorization
                )
                and "allow_hidden" not in content_obj.properties
            ):
                content.hidden = None

        if content.value:
            if content.cluster:
                cluster_obj = fetch_by_id(
                    Cluster.objects.all(),
                    [content.cluster],
                    check_short_id=True,
                    check_short_name=True,
                ).first()
                if cluster_obj:
                    required_keys = Content.objects.required_keys_full(
                        cluster_obj
                    )
                else:
                    # don't disclose cluster existence
                    required_keys = ["invalid"]
            else:
                required_keys = Content.objects.required_keys_full(
                    content_obj.cluster
                )
            if isinstance(required_keys, QuerySet):
                required_keys = required_keys.annotate(
                    keyHash=Substr("contentHash", 5)
                ).values_list("keyHash", flat=True)
            required_keys = set(required_keys)
        pre_clean_content_spec(False, content, result)

        returnval = ContentMutation(
            **update_content_fn(
                info.context["request"],
                content_obj,
                content,
                updateId=updateId,
                required_keys=required_keys,
                authset=authorization,
            )(transaction.atomic)
        )
    else:
        result = ids_to_results(
            info.context["request"],
            content.cluster,
            Cluster,
            scope="create",
            authset=authorization,
            cacheName=None,
        )["Cluster"]
        cluster_obj = result["objects_without_public"].first()
        if not cluster_obj:
            raise ValueError("Cluster for Content not found")

        if content.hidden is not None:
            if (
                "allow_hidden"
                not in get_cached_net_properties(
                    info.context["request"], authset=authorization
                )
                and "allow_hidden" not in cluster_obj.properties
            ):
                content.hidden = None

        # is a key spec
        if not content.key:
            required_keys = set(
                Content.objects.required_keys_full(cluster_obj).values_list(
                    "contentHash", flat=True
                )
            )
        pre_clean_content_spec(True, content, result)

        returnval = ContentMutation(
            **create_content_fn(
                info.context["request"],
                content,
                required_keys=required_keys,
                authset=authorization,
            )(transaction.atomic)
        )
    f = get_cached_result(info.context["request"], authset=authorization)
    f.preinit("Content", "Cluster")
    return returnval


@django_resolver
def mutate_logout_user(info: Info) -> None:
    user = getattr(info.context["request"], "user", None)
    if user and getattr(user, "is_authenticated", True):
        from django.contrib.auth import logout

        logout(info.context["request"])
