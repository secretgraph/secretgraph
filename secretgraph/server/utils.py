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
    all_filters = models.Q()
    result = {
        "components": {}
    }
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
        if not actions:
            continue

        excl_filters = models.Q()
        excl_values = models.Q()
        fullaccess = False
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
                fullaccess=fullaccess
            )
            if result is None:
                continue
            if not fullaccess and result.get("fullaccess", False):
                fullaccess = True
                excl_filters = result.get("excl_filters", models.Q())
                excl_values = result.get("excl_values", models.Q())
            else:
                excl_filters |= result.get("excl_filters", models.Q())
                excl_values |= result.get("excl_values", models.Q())
            components.update(result.get("extra_components", []))

            if action.keyhash != keyhashes[0]:
                Action.objects.filter(keyhash=action.keyhash).update(
                    keyhash=keyhashes[0]
                )
        result["components"][componentflexid] = {
            "excl_values": excl_values,
            "excl_filters": excl_filters,
            "fullaccess": fullaccess,
            "key": key
        }
        components.add(componentflexid)
        if isinstance(query.model, Component):
            all_filters |= (
                ~excl_filters & models.Q(id=actions[0].component_id)
            )
        else:
            all_filters |= (
                ~excl_filters & models.Q(component_id=actions[0].component_id)
            )
    if isinstance(query.model, Component):
        result["objects"] = \
            query.filter(all_filters, flexid__in=components)
    else:
        result["objects"] = \
            query.filter(all_filters, component__flexid__in=components)
    return result


def parse_name_q(q, negated=False, _d=None):
    if _d:
        _d = {}
    if negated:
        negated = not q.negated
    else:
        negated = q.negated
    if negated:
        prefix = "exclude_name"
    else:
        prefix = "include_name"

    for c in q.children:
        if isinstance(c, models.Q):
            parse_name_q(c, _d=_d, negated=negated)
        elif c[0] == "name":
            _d.setdefault(prefix, set())
            _d[prefix].add(c[1])
        elif c[0] == "name__in":
            _d.setdefault(prefix, set())
            _d[prefix].update(c[1])
        elif c[0] == "name__startswith":
            _d.setdefault(f"{prefix}__startswith", set())
            _d[f"{prefix}__startswith"].add(c[1])
    if "include_name" in _d:
        _d["include_name"].difference_update(_d.pop("exclude_name", []))
    return _d


def check_name(d, name):
    if "include_name" in d:
        if name not in d["include_name"]:
            return False
    if "include_name__startswith" in d:
        if not all(lambda x: name in x, d["include_name__startswith"]):
            return False
    if "exclude_name" in d:
        if name in d["exclude_name"]:
            return False
    if "exclude_name__startswith" in d:
        if not all(lambda x: name not in x, d["exclude_name__startswith"]):
            return False
    return True
