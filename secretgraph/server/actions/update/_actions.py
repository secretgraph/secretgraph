__all__ = ["manage_actions_fn"]


import base64
import json
import os
from contextlib import nullcontext
from typing import List

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db.models import Q
from django.utils import timezone

from ...utils.auth import (
    retrieve_allowed_objects,
    stub_retrieve_allowed_objects,
    get_cached_result,
)
from ...utils.misc import refresh_fields
from ...utils.hashing import hashObject
from ...actions.handler import ActionHandler
from ...models import Action, Content, Cluster, ContentAction

from ._arguments import ActionInput


_valid_lengths = {32, 50}


def manage_actions_fn(
    request, obj, actionlist: List[ActionInput], authset=None, admin=False
):
    add_actions = {}
    delete_actions = set()
    delete_actions_content = set()
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
        allowed_and_existing_actions = get_cached_result(
            request,
            scope="manage",
            name="secretgraphCleanResult",
            authset=authset,
            stub="none",
        )["Action"]["objects"]
    elif admin:
        # we don't need to filter as admin
        allowed_and_existing_actions = get_cached_result(
            request,
            stub_retrieve_allowed_objects(
                request,
                cluster.actions.all(),
                scope="manage",
                authset=authset,
            ),
            scope="manage",
            name="secretgraphCleanResult",
            authset=authset,
            stub="all",
        )["Action"]["objects"]
    else:
        # normal code path for existing contents/cluster
        allowed_and_existing_actions = get_cached_result(
            request,
            retrieve_allowed_objects(
                request,
                cluster.actions.all(),
                scope="manage",
                authset=authset,
            ),
            scope="manage",
            name="secretgraphCleanResult",
            authset=authset,
        )["Action"]["objects"]
    for action in actionlist:
        # if already decoded by e.g. graphql
        if action.value == "delete":
            action_value = "delete"
        else:
            action_value = action.value
            if isinstance(action_value, str):
                action_value = json.loads(action_value)
        if action_value == "delete" or action.existingHash:
            if action.existingHash:
                if action_value == "delete":
                    if action.existingHash in add_actions:
                        raise ValueError(
                            "Cannot update and delete the same Action"
                        )
                    delete_actions.add(action.existingHash)
                elif content:
                    delete_actions_content.add(action.existingHash)
                else:
                    delete_actions.add(action.existingHash)
            continue
        action_key = getattr(action, "key", None)
        if isinstance(action_key, bytes):
            pass
        elif isinstance(action_key, str):
            action_key = base64.b64decode(action_key)
        else:
            raise ValueError("No key specified/available")

        if len(action_key) not in _valid_lengths:
            raise ValueError("Invalid key size")

        action_key_hash = hashObject((b"secretgraph", action_key))
        action_value = ActionHandler.clean_action(
            action_value,
            request=request,
            content=content,
        )

        # create Action object
        aesgcm = AESGCM(action_key[-32:])
        nonce = os.urandom(13)
        # add contentAction
        group = action_value.pop("contentActionGroup", "")
        maxLifetime = action_value.pop("maxLifetime", None)
        if content:
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
        add_actions[actionObj.keyHash] = actionObj

    delete_q = Q(keyHash__in=delete_actions)
    if content:
        delete_q |= Q(
            keyHash__in__in=delete_actions_content,
            contentAction__content=content,
        )

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            if not create and (delete_actions or delete_actions_content):
                # delete old actions of obj, if allowed to
                allowed_and_existing_actions.filter(delete_q).delete()
            if add_actions:
                if create:
                    Action.objects.bulk_create(
                        refresh_fields(add_actions.values(), "cluster")
                    )
                    if content:
                        ContentAction.objects.bulk_create(
                            map(
                                lambda c: c.contentAction,
                                filter(
                                    lambda x: x.contentAction,
                                    add_actions.values(),
                                ),
                            )
                        )
                else:
                    Action.objects.bulk_create(add_actions.values())
                    if content:
                        ContentAction.objects.bulk_create(
                            map(
                                lambda c: c.contentAction,
                                filter(
                                    lambda x: x.contentAction,
                                    add_actions.values(),
                                ),
                            )
                        )
        return obj

    setattr(save_fn, "actions", [*add_actions.values()])
    setattr(save_fn, "action_types", action_types)
    return save_fn
