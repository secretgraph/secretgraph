__all__ = ["manage_actions_fn"]


import base64
import json
import os
from contextlib import nullcontext
from typing import List

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db.models import Q
from django.utils import timezone

from ...utils.auth import retrieve_allowed_objects
from ...utils.misc import refresh_fields
from ...utils.hashing import hashObject
from ...actions.handler import ActionHandler
from ...models import Action, Content, Cluster, ContentAction

from ._arguments import ActionInput


def manage_actions_fn(
    request, obj, actionlist: List[ActionInput], authset=None, admin=False
):
    add_actions = []
    modify_actions = {}
    delete_actions = set()
    action_types = set()

    if isinstance(obj, Content):
        cluster = obj.cluster
        content = obj
    elif isinstance(obj, Cluster):
        cluster = obj
        content = None
    else:
        raise ValueError("Invalid type")
    create = not cluster.pk

    if create:
        # we have no Actions and so we need no filtering
        # and the related manager is maybe not initialized
        # so skip the other code pathes
        allowed_and_existing_actions = Action.objects.none()
    elif admin:
        # we don't need to filter as admin
        allowed_and_existing_actions = cluster.actions.all()
    else:
        # normal code path for existing contents/cluster
        allowed_and_existing_actions = (
            retrieve_allowed_objects(
                request,
                cluster.actions.all(),
                scope="manage",
                authset=authset,
            )
        )["objects"]
    for action in actionlist:
        # if already decoded by e.g. graphql
        if action.value == "delete":
            action_value = "delete"
        else:
            action_value = action.value
            if isinstance(action_value, str):
                action_value = json.loads(action_value)
        if action_value == "delete":
            if "existingHash" in action:
                if action["existingHash"] in modify_actions:
                    raise ValueError("update id in delete set")
                delete_actions.add(action["existingHash"])
            continue
        action_key = getattr(action, "key", None)
        if isinstance(action_key, bytes):
            pass
        elif isinstance(action_key, str):
            action_key = base64.b64decode(action_key)
        else:
            raise ValueError("No key specified/available")

        action_key_hash = hashObject(action_key)
        action_value = ActionHandler.clean_action(
            action_value, request=request, authset=authset, content=content
        )

        # create Action object
        aesgcm = AESGCM(action_key)
        nonce = os.urandom(13)
        # add contentAction
        group = action_value.pop("contentActionGroup", "")
        maxLifetime = action_value.pop("maxLifetime", None)
        existing = action.existingHash
        if existing:
            if existing.isdecimal():
                actionObjs = allowed_and_existing_actions.filter(
                    Q(id=int(existing)) | Q(keyHash=existing)
                )
            else:
                actionObjs = allowed_and_existing_actions.filter(
                    keyHash=existing
                )
            if not actionObjs.exists():
                continue
            else:
                actionObj = actionObjs.first()
                for obj in actionObjs[1:]:
                    if obj.id in modify_actions:
                        continue
                    delete_actions.add(obj.id)
        elif content:
            actionObj = Action(contentAction=ContentAction(content=content))
        else:
            actionObj = Action()
        if content:
            actionObj.contentAction.group = group
        actionObj.value = aesgcm.encrypt(
            nonce, json.dumps(action_value).encode("utf-8"), None
        )
        # reset used
        actionObj.used = None
        actionObj.start = action.start or timezone.now()
        actionObj.stop = action.stop or None
        if maxLifetime:
            maxStop = actionObj.start + maxLifetime
            if actionObj.stop:
                actionObj.stop = min(maxStop, actionObj.stop)
            else:
                actionObj.stop = maxStop
        actionObj.keyHash = action_key_hash
        actionObj.nonce = base64.b64encode(nonce).decode("ascii")
        actionObj.cluster = cluster
        actionObj.action_type = action_value["action"]
        action_types.add(action_value["action"])
        if actionObj.id:
            if actionObj.id in delete_actions:
                raise ValueError("update id in delete set")
            modify_actions[actionObj.id] = actionObj
        else:
            add_actions.append(actionObj)

    if None in delete_actions:
        if content:
            delete_q = Q()
        else:
            delete_q = Q(ContentAction__isnull=True)
    else:
        ldelete_actions = list(delete_actions)
        delete_q = Q(keyHash__in=ldelete_actions)

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            if not create and delete_q:
                # delete old actions of obj, if allowed to
                actions = allowed_and_existing_actions.filter(delete_q)
                if content:
                    # recursive deletion
                    ContentAction.objects.filter(
                        action__in=actions,
                        content=content,
                    ).delete()
                else:
                    # direct deletion
                    actions.delete()
            if add_actions:
                ContentAction.objects.bulk_create(
                    map(
                        lambda c: c.contentAction,
                        filter(lambda x: x.contentAction, add_actions),
                    )
                )
            if create:
                Action.objects.bulk_create(
                    refresh_fields(add_actions, "cluster")
                )
            else:
                if modify_actions:
                    ContentAction.objects.bulk_update(
                        [
                            c.contentAction
                            for c in filter(
                                lambda x: x.contentAction,
                                modify_actions.values(),
                            )
                        ],
                        ["content", "used", "group"],
                    )
                Action.objects.bulk_create(add_actions)
                Action.objects.bulk_update(
                    modify_actions.values(),
                    [
                        "keyHash",
                        "nonce",
                        "value",
                        "start",
                        "stop",
                    ],
                )

    setattr(save_fn, "actions", [*add_actions, *modify_actions.values()])
    setattr(save_fn, "action_types", action_types)
    return save_fn
