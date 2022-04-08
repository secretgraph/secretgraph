import base64
import logging
import os
from datetime import timedelta as td
from typing import Optional, List

import strawberry
from strawberry_django_plus.relay import to_base64, GlobalID, input_mutation
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Subquery
from django.utils import timezone

from ....constants import MetadataOperations, TransferResult
from ...actions.update import (
    create_cluster_fn,
    create_content_fn,
    transfer_value,
    update_cluster_fn,
    update_content_fn,
    update_metadata_fn,
    manage_actions_fn,
)
from ...models import Cluster, Content, GlobalGroupProperty, GlobalGroup
from ...signals import generateFlexid
from ...utils.auth import (
    fetch_by_id,
    ids_to_results,
    initializeCachedResult,
    retrieve_allowed_objects,
    check_permission,
)
from ..arguments import (
    AuthList,
    ActionInput,
    ClusterInput,
    ContentInput,
    PushContentInput,
    ReferenceInput,
)
from ...utils.arguments import pre_clean_content_spec
from ..definitions import ClusterNode, ContentNode

logger = logging.getLogger(__name__)


@strawberry.type
class ClusterMutation:
    class Input:
        id: Optional[ID]
        updateId: Optional[ID]
        cluster: ClusterInput
        authorization: Optional[AuthList]

    cluster: ClusterNode
    writeok: bool

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        cluster,
        id=None,
        updateId=None,
        authorization=None,
    ):
        manage = retrieve_allowed_objects(
            info.context,
            "manage",
            Cluster.objects.all(),
            authset=authorization,
        )
        if cluster.get("featured") is not None:
            if not check_permission(
                info.context, "manage_featured", manage["objects"]
            ):
                del cluster["featured"]

        if cluster.get("groups") is not None:
            if check_permission(
                info.context, "manage_groups", manage["objects"]
            ):
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
        initializeCachedResult(info.context, authset=authorization)
        return cls(**_cluster_res)


@strawberry.type
class ContentMutation:
    class Input:
        id: Optional[ID]
        content: ContentInput
        updateId: Optional[ID]
        authorization: Optional[AuthList]

    content: ContentNode
    writeok: bool

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, content, id=None, updateId=None, authorization=None
    ):
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
        initializeCachedResult(info.context, authset=authorization)
        return returnval
