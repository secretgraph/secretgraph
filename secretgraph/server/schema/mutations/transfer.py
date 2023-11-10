import base64
import logging
import os
from typing import Optional

import ratelimit
import strawberry
from django.conf import settings
from django.db import transaction
from django.db.models.functions import Substr
from strawberry import relay
from strawberry.scalars import JSON
from strawberry.types import Info

from ....core.constants import TransferResult
from ...actions.update import (
    ContentInput,
    ContentValueInput,
    create_content_fn,
    sync_transfer_value,
)
from ...models import Cluster, Content, ContentTag
from ...typings import AllowedObjectsResult
from ...utils.arguments import pre_clean_content_spec
from ...utils.auth import (
    fetch_by_id,
    get_cached_net_properties,
    get_cached_result,
    ids_to_results,
    retrieve_allowed_objects,
)
from ..arguments import AuthList, PushContentInput
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
    objs = Content.objects.filter(markForDestruction__isnull=True)
    if content.parent:
        objs = fetch_by_id(objs, content.parent)
    result = retrieve_allowed_objects(
        info.context["request"],
        objs,
        "push",
        authset=authorization,
    )
    if not content.parent and result["accesslevel"] != 3:
        raise ValueError("Could not determinate parent for push operation")
    source = result["objects_without_public"].get()
    cleaned_result = pre_clean_content_spec(True, content, result)
    required_keys = set(
        Content.objects.required_keys_full(source.cluster).values_list(
            "contentHash", flat=True
        )
    )
    action_key = None
    if cleaned_result["updateable"]:
        action_key = os.urandom(50)
        content.value.actions.append(
            {
                "key": action_key,
                "action": "update",
                "allowedActions": ["view", "update"],
                "injectedReferences": list(
                    cleaned_result["injectedReferences"]
                ),
                "injectedTags": list(cleaned_result["injectedTags"]),
            }
        )
    c = create_content_fn(
        info.context["request"],
        content,
        required_keys=required_keys,
        authset=result["authset"],
    )(transaction.atomic)
    f = get_cached_result(info.context["request"], authset=result["authset"])
    f.preinit("Content", "Cluster")
    return PushContentMutation(
        content=c, actionKey=base64.b64encode(action_key).decode("ascii")
    )


@strawberry.type
class TransferMutation:
    content: Optional[ContentNode] = None


def mutate_transfer(
    info: Info,
    id: Optional[relay.GlobalID],
    url: str,
    headers: Optional[JSON] = None,
    authorization: Optional[AuthList] = None,
) -> TransferMutation:
    if headers and not isinstance(headers, dict):
        raise ValueError("invalid headers")
    view_result: AllowedObjectsResult = get_cached_result(
        info.context, authset=authorization
    )["Content"]
    # allow admin pulls
    if id:
        if "manage_update" in get_cached_net_properties(
            info.context["request"]
        ):
            transfer_target: Cluster = id.resolve_node_sync(
                info, required=True, ensure_type=Content
            )
        else:
            transfer_target: Content = ids_to_results(
                info.context["request"],
                id,
                Content,
                scope="update",
                authset=view_result["authset"],
                cacheName=None,
            )["Content"]["objects_without_public"].get(
                markForDestruction__isnull=True
            )
    else:
        transfer_target = retrieve_allowed_objects(
            info.context["request"],
            "Content",
            "update",
            authset=authorization,
        )["objects_without_public"].get()
    # was signed? => restrict to keys
    signer_keys = view_result["objects_with_public"].filter(
        type="PublicKey",
        referencedBy__source=transfer_target,
        referencedBy__group="signature",
    )
    signer_key_hashes = list(
        ContentTag.objects.filter(
            content__in=signer_keys, tag__startswith="key_hash="
        )
        .annotate(key=Substr("tag", 10))
        .values_list("key", flat=True)
    )

    tres = sync_transfer_value(
        info.context["request"],
        transfer_target,
        url=url,
        headers=headers,
        key_hashes=signer_key_hashes,
        delete_on_failed_verification=True,
        delete_on_error=False,
        is_transfer=True,
    )

    if tres == TransferResult.NOTFOUND:
        transfer_target.delete()
    elif tres == TransferResult.SUCCESS:
        f = get_cached_result(
            info.context["request"], authset=view_result["authset"]
        )
        f.preinit("Content", "Cluster", refresh=True)
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
    headers: Optional[JSON] = None,
    authorization: Optional[AuthList] = None,
) -> TransferMutation:
    view_result: AllowedObjectsResult = get_cached_result(
        info.context, authset=authorization
    )["Content"]
    if id.type_name == "Content":
        # allow admin pulls
        if "manage_update" in get_cached_net_properties(
            info.context["request"]
        ):
            target: Cluster = id.resolve_node_sync(
                info, required=True, ensure_type=Content
            )
        else:
            target: Content = ids_to_results(
                info.context["request"],
                id,
                Content,
                scope="update",
                authset=view_result["authset"],
                cacheName=None,
            )["Content"]["objects_without_public"].get()
    else:
        # allow admin pulls
        if "manage_update" in get_cached_net_properties(
            info.context["request"]
        ):
            target: Cluster = id.resolve_node_sync(
                info, required=True, ensure_type=Cluster
            )
        else:
            target: Cluster = ids_to_results(
                info.context["request"],
                id,
                Content,
                scope="create",
                authset=view_result["authset"],
                cacheName=None,
            )["Cluster"]["objects_without_public"].get()

    signature_and_key_retrieval_rate = settings.SECRETGRAPH_RATELIMITS.get(
        "PULL"
    )
    if signature_and_key_retrieval_rate:
        r = ratelimit.get_ratelimit(
            group="pull",
            key=b"%i" % target.net_id,
            request=info.context["request"],
            rate=signature_and_key_retrieval_rate,
            action=ratelimit.Action.INCREASE,
        )
        if r.request_limit >= 1:
            raise ratelimit.RatelimitExceeded("Ratelimit for pull exceeded")

    if isinstance(target, Content):
        transfer_target = target
    else:
        transfer_target = create_content_fn(
            info.context["request"],
            ContentInput(
                net=target.net,
                cluster=target,
                value=ContentValueInput(
                    value=b"", state="draft", type="External"
                ),
            ),
            authset=view_result["authset"],
        )

    # was signed? => restrict to keys
    signer_keys = view_result["objects_with_public"].filter(
        type="PublicKey",
        referencedBy__source=transfer_target,
        referencedBy__group="signature",
    )
    signer_key_hashes = list(
        ContentTag.objects.filter(
            content__in=signer_keys, tag__startswith="key_hash="
        ).values_list("tag", flat=True)
    )

    tres = sync_transfer_value(
        info.context["request"],
        transfer_target,
        url=url,
        headers=headers,
        key_hashes=signer_key_hashes,
        delete_on_failed_verification=False,
        delete_on_error=False,
        is_transfer=False,
    )

    if tres == TransferResult.NOTFOUND:
        transfer_target.delete()
    elif tres == TransferResult.SUCCESS:
        f = get_cached_result(
            info.context["request"],
            authset=view_result["authset"],
        )
        f.preinit("Content", "Cluster", refresh=True)
        return TransferMutation(content=transfer_target)
    return TransferMutation(content=None)
