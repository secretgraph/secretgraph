from __future__ import annotations

import base64
import logging
import os
from typing import Optional, Annotated

import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry_django_plus import relay, gql
from django.db import transaction

from ....constants import TransferResult
from ...actions.update import transfer_value, create_content_fn
from ...models import Content
from ...utils.auth import (
    ids_to_results,
    get_cached_result,
)
from ..arguments import (
    AuthList,
    PushContentInput,
)
from ...utils.arguments import pre_clean_content_spec
from ..definitions import ContentNode

logger = logging.getLogger(__name__)


@strawberry.type
class PushContentMutation:
    content: ContentNode
    actionKey: Optional[str]

    @gql.django.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
        info: Info,
        content: PushContentInput,
        authorization: Optional[AuthList] = None,
    ) -> PushContentMutation:
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
        get_cached_result(info.context, authset=authorization)
        return cls(
            content=c, actionKey=base64.b64encode(action_key).decode("ascii")
        )


@strawberry.type
class TransferMutation:

    content: Optional[ContentNode] = None

    @gql.django.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        id: relay.GlobalID,
        url: Optional[str] = None,
        key: Annotated[
            Optional[str], strawberry.argument(description="Transfer Key")
        ] = None,
        headers: Optional[JSON] = None,
        authorization: Optional[AuthList] = None,
    ) -> TransferMutation:
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
