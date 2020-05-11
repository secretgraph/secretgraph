__all__ = ["create_actions_func", "create_action_for_content"]


import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db.models import Q
from django.utils import timezone
from graphql_relay import from_global_id

from ...actions.handler import ActionHandler
from ...models import (
    Action, Content, ContentAction
)
from ...utils.auth import retrieve_allowed_objects
from ...utils.misc import hash_object


def create_actions_func(cluster, actionlists, request, addonly=False):
    final_actions = []
    final_content_actions = []
    action_types = set()
    include_deletion = set()
    default_key = request.headers.get("Authorization", "").replace(
        " ", ""
    ).split(",", 1)[0].split(":", 1)[-1]
    try:
        default_key = base64.b64decode(default_key)
    except Exception:
        default_key = None
    for actionlist in actionlists:
        content = actionlist.get("content")
        if content:
            if isinstance(content, str):
                type_name, id = from_global_id(content)
                if type_name != "Content":
                    raise ValueError("Invalid type, requires content")
                content = Content.objects.get(
                    mark_for_destruction=None, flexid=id,
                    cluster=cluster
                )
                include_deletion.add(content.id)
        else:
            include_deletion.add(None)
        for action in actionlist.get("actions") or []:
            action_key = action.get("key")
            if isinstance(action_key, bytes):
                pass
            elif isinstance(action_key, str):
                action_key = base64.base64_decode(action_key)
            elif default_key:
                action_key = default_key
            else:
                raise ValueError("No key specified/available")

            action_key_hash = hash_object(action_key)
            action_value = action["value"]
            if isinstance(str, action_value):
                action_value = json.loads(action_value)
            action_value = ActionHandler.clean_action(
                action_value, request, content
            )

            # create Action object
            aesgcm = AESGCM(action_key)
            nonce = os.urandom(13)
            # add content_action
            group = action_value.pop("content_action_group") or ""
            if content:
                c = ContentAction(
                    content=content,
                    group=group
                )
                final_content_actions.append(c)

            action = Action(
                value=aesgcm.encode(
                    nonce,
                    json.dumps(action_value).encode("utf-8"),
                    None
                ),
                start=action.get("start", timezone.now()),
                stop=action.stop,
                key_hash=action_key_hash,
                nonce=base64.b64encode(nonce).decode("ascii"),
                content_action=c
            )
            action.action_type = action_value["action"]
            action_types.add(action_value["action"])
            final_actions.append(action)

    def save_func():
        result = retrieve_allowed_objects(
            request, "manage", cluster.actions.all()
        )
        if not addonly:
            # delete old actions in group if allowed
            # content==null does not exist so None in set does no harm
            actions = result["objects"].filter(
                Q(content_action__content__in=include_deletion) |
                Q(content_action=None) if None in include_deletion else Q()
            )
            ContentAction.objects.filter(
                action__in=actions
            ).delete()
            actions.delete()
        ContentAction.objects.bulk_create(final_content_actions)
        cluster.actions.bulk_create(final_actions)
    setattr(save_func, "actions", final_actions)
    setattr(save_func, "content_actions", final_content_actions)
    setattr(save_func, "action_types", action_types)
    setattr(save_func, "key", default_key)
    return save_func


def create_action_for_content(content, definition, request):
    cluster = content.cluster
    key = os.urandom(32)
    actionlists = [{
        "content": content,
        "actions": [{
            "key": key,
            "value": definition
        }]
    }]
    create_actions_func(cluster, actionlists, request, addonly=True)()
    return key
