import base64
import logging
import os
from datetime import timedelta as td
from itertools import chain

import strawberry
from strawberry_django_plus import relay
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


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        content
        authorization

    content: ContentNode
    actionKey: Optional[str]

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        content: PushContentInput,
        authorization: Optional[AuthList] = None,
    ):
        parent_id = content.pop("parent")
        result = ids_to_results(
            info.context, parent_id, Content, "push", authset=authorization
        )["Content"]
        source = result["objects"].first()
        if not source:
            raise ValueError("Content not found")
        res = pre_clean_content_spec(True, content, result)
        required_keys = set(
            Content.objects.required_keys_full(source.cluster).values_list(
                "contentHash", flat=True
            )
        )
        action_key = None
        if res["updateable"]:
            action_key = os.urandom(32)
            content["actions"] = [
                {
                    "key": action_key,
                    "action": "update",
                    "restrict": True,
                    "freeze": res["freeze"],
                }
            ]
        c = create_content_fn(
            info.context,
            content,
            required_keys=required_keys,
            authset=authorization,
        )(transaction.atomic)
        initializeCachedResult(info.context, authset=authorization)
        return cls(
            content=c, actionKey=base64.b64encode(action_key).decode("ascii")
        )


class TransferMutation(relay.ClientIDMutation):
    class Input:
        id: ID
        url: Optional[str]
        key: Optional[str] = strawberry.field(description="Transfer Key")
        headers: Optional[JSON] = null
        authorization: Optional[AuthList]

    content: Optional[ContentNode] = null

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        id,
        url=None,
        key=None,
        authorization=None,
        headers=None,
    ):
        result = ids_to_results(
            info.context, id, Content, "update", authset=authorization
        )["Content"]
        content_obj = result.objects.first()
        if not content_obj:
            raise ValueError()
        if key and url:
            raise ValueError()

        trustedKeys = set()
        for action_id in result["active_actions"]:
            action_dict = result["decrypted"][action_id]
            trustedKeys.update(action_dict.get("trustedKeys"))
        verifiers = Content.objects.filter(
            contentHash__in=trustedKeys, type="PublicKey"
        )

        tres = transfer_value(
            content_obj, key=key, url=url, headers=headers, verifiers=verifiers
        )

        if tres in {
            TransferResult.NOTFOUND,
            TransferResult.FAILED_VERIFICATION,
        }:
            content_obj.delete()
        elif result == TransferResult.SUCCESS:
            return cls(content=content_obj)
        return cls(content=None)
