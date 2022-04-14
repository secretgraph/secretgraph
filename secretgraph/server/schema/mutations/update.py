from __future__ import annotations

import logging
from typing import Optional

import strawberry
from strawberry_django_plus import relay
from strawberry_django_plus import gql
from strawberry.types import Info
from django.conf import settings
from django.db import transaction

from ...actions.update import (
    create_cluster_fn,
    create_content_fn,
    update_cluster_fn,
    update_content_fn,
)
from ...models import Cluster, Content, GlobalGroupProperty, GlobalGroup
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


@strawberry.type
class ClusterMutation:
    cluster: ClusterNode
    writeok: bool

    @gql.django.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
        info: Info,
        cluster: ClusterInput,
        id: Optional[relay.GlobalID] = None,
        updateId: Optional[strawberry.ID] = None,
        authorization: Optional[AuthList] = None,
    ) -> ClusterMutation:
        manage = retrieve_allowed_objects(
            info.context,
            Cluster.objects.all(),
            scope="manage",
            authset=authorization,
        )
        if cluster.get("featured") is not None:
            if not get_cached_permissions(info.context, authset=authorization)[
                "manage_featured"
            ]:
                del cluster["featured"]

        if cluster.get("groups") is not None:
            if get_cached_permissions(info.context, authset=authorization)[
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
                info.context, id, Cluster, "update", authset=authorization
            )["Cluster"]
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError("No cluster found")
            _cluster_res = update_cluster_fn(
                info.context,
                cluster_obj,
                cluster,
                updateId,
                authset=authorization,
            )(transaction.atomic)
        else:
            user = None
            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if manage:
                    user = manage.first().user
                if not user:
                    user = getattr(info.context, "user", None)
                if not user or not user.is_authenticated:
                    raise ValueError("Must be logged in")
            elif (
                getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False)
                == "cluster"
                and not manage.exist()
            ):
                raise ValueError("Cannot register new cluster")
            elif (
                getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False)
                is not True
            ):
                raise ValueError("Cannot register new cluster")
            cluster["groups"] = GlobalGroupProperty.objects.get_or_create(
                name="default", defaults={}
            )[0].groups.all()
            _cluster_res = create_cluster_fn(
                info.context, cluster, user=user, authset=authorization
            )(transaction.atomic)
        get_cached_result(info.context, authset=authorization)
        return cls(**_cluster_res)


@strawberry.type
class ContentMutation:

    content: ContentNode
    writeok: bool

    @gql.django.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
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
                info.context, id, Content, "update", authset=authorization
            )["Content"]
            content_obj = result["objects"].first()
            if not content_obj:
                raise ValueError()

            if content.value:
                if content.cluster:
                    clusterObj = fetch_by_id(
                        Cluster.objects.all(), [content.cluster]
                    ).first()
                    if clusterObj:
                        required_keys = Content.objects.required_keys_full(
                            clusterObj
                        )
                    else:
                        raise ValueError("cluster not found")
                else:
                    required_keys = Content.objects.required_keys_full(
                        clusterObj
                    )
                required_keys = set(
                    required_keys.values_list("contentHash", flat=True)
                )
            pre_clean_content_spec(False, content, result)

            returnval = cls(
                **update_content_fn(
                    info.context,
                    content_obj,
                    content,
                    updateId=updateId,
                    required_keys=required_keys,
                    authset=authorization,
                )(transaction.atomic)
            )
        else:
            result = ids_to_results(
                info.context,
                content.cluster,
                Cluster,
                "create",
                authset=authorization,
            )["Cluster"]
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError("Cluster for Content not found")

            # is a key spec
            if not content.key:
                required_keys = set(
                    Content.objects.required_keys_full(
                        cluster_obj
                    ).values_list("contentHash", flat=True)
                )
            pre_clean_content_spec(True, content, result)

            returnval = cls(
                **create_content_fn(
                    info.context,
                    content,
                    required_keys=required_keys,
                    authset=authorization,
                )(transaction.atomic)
            )
        get_cached_result(info.context, authset=authorization)
        return returnval
