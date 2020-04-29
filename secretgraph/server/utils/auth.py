import base64
import hashlib
import json

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db import models
from django.utils import timezone
from django.conf import settings

from ..models import Action, Component, Content
from ..actions.handler import ActionHandler


def calculate_hashes(inp):
    hashes = []
    for algo in settings.SECRETGRAPH_HASH_ALGORITHMS:
        if isinstance(algo, str):
            algo = hashlib.new(algo)
        hashes.append(
            base64.b64encode(algo.update(inp).digest()).decode("ascii")
        )
    return inp


def retrieve_allowed_objects(request, scope, query, authset=None):
    if not authset:
        authset = set(request.headers.get("Authorization", "").replace(
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
    all_filters = models.Q()
    result = {
        "components": {},
        "action_extras": {},
        "actions": Action.objects.none(),
        "action_key_map": {}
    }
    for item in authset:
        spitem = item.split(":", 1)
        if len(spitem) != 2:
            continue

        componentflexid, action_key = spitem[-2:]
        try:
            action_key = base64.b64decode(action_key)
        except Exception:
            continue
        aesgcm = AESGCM(action_key)
        keyhashes = calculate_hashes(action_key)

        actions = pre_filtered_actions.filter(
            component__flexid=componentflexid,
            key_hash__in=keyhashes
        )
        if not actions:
            continue

        filters = models.Q()
        # 1 normal
        # 2 owner
        # 3 special
        accesslevel = 1
        for action in actions:
            action_dict = json.loads(aesgcm.decrypt(
                base64.b64decode(action.nonce),
                action.value,
                None
            ))
            result = ActionHandler.handle_action(
                query.model,
                action_dict,
                scope=scope,
                action=action,
                accesslevel=accesslevel,
                request=request
            )
            if result is None:
                continue
            foundaccesslevel = result.get("accesslevel", 1)
            result["action_extras"][action.id] = result.get("extras", set())
            if accesslevel < foundaccesslevel:
                accesslevel = foundaccesslevel
                filters = result.get("filters", models.Q())
            elif accesslevel == foundaccesslevel:
                filters &= result.get("filters", models.Q())
            # components.update(result.get("extra_components", []))

            if action.key_hash != keyhashes[0]:
                Action.objects.filter(keyhash=action.keyhash).update(
                    key_hash=keyhashes[0]
                )
        result["components"][componentflexid] = {
            "filters": filters,
            "accesslevel": accesslevel,
            "action_key": action_key,
            "actions": actions,
        }
        result["actions"] |= actions
        for h in keyhashes:
            result["action_key_map"][h] = action_key
        components.add(componentflexid)
        if issubclass(query.model, Component):
            all_filters |= (
                filters & models.Q(id=actions[0].component_id)
            )
        else:
            all_filters |= (
                filters & models.Q(component_id=actions[0].component_id)
            )

    if issubclass(query.model, Component):
        all_filters &= models.Q(flexid__in=components)
    else:
        all_filters &= models.Q(component__flexid__in=components)
    if issubclass(query.model, Content):
        all_filters &= (
            models.Q(action__in=actions) |
            models.Q(action_id__isnull=True)
        )
    result["objects"] = query.filter(all_filters)
    return result
