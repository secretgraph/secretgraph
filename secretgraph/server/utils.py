import base64
import hashlib
import json

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db import models
from django.utils import timezone
from django.conf import settings

from .models import Action, Component
from .actions import ActionHandler


def retrieve_allowed_objects(info, scope, query):
    authset = set(info.context.headers.get("Authorization", "").replace(
        " ", ""
    ).split(","))
    now = timezone.now()
    pre_filtered_actions = Action.objects.select_related("component").filter(
        start__lte=now
    ).filter(
        models.Q(stop__isnull=True) |
        models.Q(stop__gte=now)
    )
    components = set()
    for item in authset:
        spitem = item.split(":", 1)
        if len(spitem) != 2:
            continue
        componentflexid, key = spitem
        try:
            key = base64.b64decode(key)
        except Exception:
            continue
        aesgcm = AESGCM(key)
        keyhashes = []
        for algo in settings.SECRETGRAPH_HASH_ALGORITHMS:
            if isinstance(algo, str):
                algo = hashlib.new(algo)
            keyhashes.append(
                base64.b64encode(algo.update(key).digest())
            )

        actions = pre_filtered_actions.filter(
            component__flexid=componentflexid,
            keyhash__in=keyhashes
        )
        fullaccess = False
        for action in actions:
            components.add(action.component_id)

            action_dict = json.loads(aesgcm.decrypt(
                base64.b64decode(action.nonce),
                action.value,
                None
            ))
            result = ActionHandler.handle_action(
                query.model,
                action_dict,
                scope=scope,
                objects=query,
                action=action,
                fullaccess=fullaccess
            )
            if result is None:
                continue
            fullaccess = fullaccess or result.get("fullaccess", False)
            query = result["objects"]

            if action.keyhash != keyhashes[0]:
                Action.objects.filter(keyhash=action.keyhash).update(
                    keyhash=keyhashes[0]
                )
    if isinstance(query.model, Component):
        return query

    return query.filter(component_id__in=components)
