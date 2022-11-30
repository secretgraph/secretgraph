from __future__ import annotations

import base64
import logging
import os
from typing import Optional

import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry_django_plus import relay
from django.db import transaction

from ....core.constants import TransferResult
from ...actions.update import sync_transfer_value, create_content_fn
from ...models import Content, ContentTag
from ...utils.auth import (
    ids_to_results,
    get_cached_result,
    retrieve_allowed_objects,
)
from ..arguments import AuthList, PushContentInput
from ...utils.arguments import pre_clean_content_spec
from ..definitions import ContentNode

logger = logging.getLogger(__name__)


@strawberry.type
class PushContentMutation:
    content: ContentNode
    actionKey: Optional[str]


def mutate_push_content(
    info: Info,
    content: PushContentInput,
    authorization: Optional[AuthList] = None,
) -> PushContentMutation:
    parent_id = content.pop("parent")
    result = ids_to_results(
        info.context.request,
        parent_id,
        Content,
        "push",
        authset=authorization,
    )["Content"]
    source = result["objects"].first()
    if not source:
        raise ValueError("Content not found")
    cleaned_result = pre_clean_content_spec(True, content, result)
    required_keys = set(
        Content.objects.required_keys_full(source.cluster).values_list(
            "contentHash", flat=True
        )
    )
    action_key = None
    if cleaned_result["updateable"]:
        action_key = os.urandom(32)
        content.value.actions.append(
            {
                "key": action_key,
                "action": "update",
            }
        )
    c = create_content_fn(
        info.context.request,
        content,
        required_keys=required_keys,
        authset=authorization,
    )(transaction.atomic)
    f = get_cached_result(info.context.request, authset=authorization)
    f["Content"]
    f["Cluster"]
    return PushContentMutation(
        content=c, actionKey=base64.b64encode(action_key).decode("ascii")
    )


@strawberry.type
class TransferMutation:

    content: Optional[ContentNode] = None


def mutate_transfer(
    info: Info,
    id: relay.GlobalID,
    url: Optional[str] = None,
    key: Optional[
        str
    ] = None,  # strawberry.argument(description="Transfer Key")
    headers: Optional[JSON] = None,
    authorization: Optional[AuthList] = None,
) -> TransferMutation:
    view_result = retrieve_allowed_objects(
        info.context, authset=authorization
    )["Content"]
    transfer_result = ids_to_results(
        info.context.request, id, Content, "update", authset=authorization
    )["Content"]
    transfer_target = transfer_result.objects.get()
    if key and url:
        raise ValueError()
    # was signed? => restrict to keys
    signer_keys = view_result["objects"].filter(
        type="PublicKey", referencedBy__source=transfer_target
    )
    signer_key_hashes = ContentTag.objects.filter(
        content__in=signer_keys, tag__startswith="key_hash="
    ).values_list("tag", flat=True)

    tres = sync_transfer_value(
        info.context.request,
        transfer_target,
        key=key,
        url=url,
        headers=headers,
        verifiers=signer_key_hashes,
        delete_failed_verification=True,
    )

    if tres == TransferResult.NOTFOUND:
        transfer_target.delete()
    elif tres == TransferResult.SUCCESS:
        f = get_cached_result(info.context.request, authset=authorization)
        f.preinit("Content", "Cluster")
        return TransferMutation(content=transfer_target)
    return TransferMutation(content=None)


@strawberry.type
class PullMutation:

    content: Optional[ContentNode] = None
    writeok: bool


def mutate_pull(
    info: Info,
    id: relay.GlobalID,
    url: Optional[str] = None,
    key: Optional[str] = None,  # encrypting key
    headers: Optional[JSON] = None,
    authorization: Optional[AuthList] = None,
) -> TransferMutation:
    view_result = retrieve_allowed_objects(
        info.context, authset=authorization
    )["Content"]
    transfer_result = ids_to_results(
        info.context.request, id, Content, "update", authset=authorization
    )["Content"]
    transfer_target = transfer_result.objects.get()
    if key and url:
        raise ValueError()
    # was signed? => restrict to keys
    signer_keys = view_result["objects"].filter(
        type="PublicKey", referencedBy__source=transfer_target
    )
    signer_key_hashes = ContentTag.objects.filter(
        content__in=signer_keys, tag__startswith="key_hash="
    ).values_list("tag", flat=True)

    tres = sync_transfer_value(
        info.context.request,
        transfer_target,
        key=key,
        url=url,
        headers=headers,
        verifiers=signer_key_hashes,
        delete_failed_verification=True,
    )

    if tres == TransferResult.NOTFOUND:
        transfer_target.delete()
    elif tres == TransferResult.SUCCESS:
        f = get_cached_result(info.context.request, authset=authorization)
        f.preinit("Content", "Cluster")
        return TransferMutation(content=transfer_target)
    return TransferMutation(content=None)
