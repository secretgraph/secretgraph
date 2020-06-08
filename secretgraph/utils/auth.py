import base64
import logging
import json

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db import models
from django.utils import timezone
from graphql_relay import from_global_id

from ..server.actions.handler import ActionHandler
from ..server.models import Action, Cluster, Content
from .misc import calculate_hashes


logger = logging.getLogger(__name__)


def retrieve_allowed_objects(request, scope, query, authset=None):
    if not authset:
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
    now = timezone.now()
    pre_filtered_actions = Action.objects.select_related("cluster").filter(
        start__lte=now
    ).filter(
        models.Q(stop__isnull=True) | models.Q(stop__gte=now)
    )
    if isinstance(query.model, Content):
        pre_filtered_actions = pre_filtered_actions.filter(
            models.Q(contentAction__isnull=True) |
            models.Q(contentAction__content__in=query)
        )
    clusters = set()
    all_filters = models.Q()
    returnval = {
        "rejecting_action": None,
        "clusters": {},
        "forms": {},
        "actions": Action.objects.none(),
        "action_key_map": {},
        "action_types_clusters": {},
        "action_types_contents": {}
    }
    for item in authset:
        spitem = item.split(":", 1)
        if len(spitem) != 2:
            continue

        clusterflexid, action_key = spitem[-2:]
        _type = "Cluster"
        try:
            _type, clusterflexid = from_global_id(clusterflexid)
        finally:
            if _type != "Cluster":
                continue
        try:
            action_key = base64.b64decode(action_key)
        except Exception:
            continue
        aesgcm = AESGCM(action_key)
        keyhashes = calculate_hashes(action_key)

        actions = pre_filtered_actions.filter(
            cluster__flexid=clusterflexid,
            keyHash__in=keyhashes
        )
        if not actions:
            continue

        filters = models.Q()
        # 0 default
        # 1 normal
        # 2 owner
        # 3 special
        accesslevel = 0
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
            if result is False:
                returnval["rejecting_action"] = (action, action_dict)
                returnval["objects"] = query.none()
                return returnval
            if action.contentAction:
                action_type_dict = \
                    returnval["action_types_contents"].setdefault(
                        action.contentAction.content_id,
                        {}
                    )
            else:
                action_type_dict = \
                    returnval["action_types_clusters"].setdefault(
                        action.cluster_id,
                        {}
                    )
            action_type_dict[action.keyHash] = action_dict["action"]

            foundaccesslevel = result["accesslevel"]

            if accesslevel < foundaccesslevel:
                accesslevel = foundaccesslevel
                filters = result.get("filters", models.Q())
                if result.get("form"):
                    returnval["forms"] = {action.id: result["form"]}
            elif accesslevel == foundaccesslevel:
                filters &= result.get("filters", models.Q())
                if result.get("form"):
                    returnval["forms"][action.id] = result["form"]

            if action.keyHash != keyhashes[0]:
                Action.objects.filter(keyHash=action.keyHash).update(
                    keyHash=keyhashes[0]
                )
        returnval["clusters"][clusterflexid] = {
            "filters": filters,
            "accesslevel": accesslevel,
            "action_key": action_key,
            "actions": actions,
        }
        returnval["actions"] |= actions
        for h in keyhashes:
            returnval["action_key_map"][h] = action_key
        clusters.add(clusterflexid)
        if issubclass(query.model, Cluster):
            all_filters |= (
                filters & models.Q(id=actions[0].cluster_id)
            )
        else:
            all_filters |= (
                filters & models.Q(cluster_id=actions[0].cluster_id)
            )

    if issubclass(query.model, Cluster):
        all_filters &= (
            models.Q(flexid__in=clusters) |
            models.Q(public=True)
        )
    else:
        all_filters &= (
            models.Q(cluster__flexid__in=clusters) |
            models.Q(cluster__public=True)
        )
        all_filters &= (
            (
                models.Q(info__tag="type=PublicKey") &
                models.Q(info__tag="state=public")
            ) |
            models.Q(action__in=actions) |
            models.Q(action_id__isnull=True)
        )
    returnval["objects"] = query.filter(all_filters)
    return returnval


def id_to_result(request, id, klasses, scope="view"):
    if not isinstance(klasses, tuple):
        klasses = (klasses,)
    if isinstance(id, str):
        type_name, flexid = from_global_id(id)
        result = None
        for klass in klasses:
            if type_name == klass.__name__:
                result = retrieve_allowed_objects(
                    request, scope, klass.objects.filter(flexid=flexid)
                )
                break
        if not result:
            raise ValueError(
                "Only for {} (ids)".format(
                    ",".join(map(lambda x: x.__name__, klasses))
                )
            )
    elif not isinstance(id, klasses):
        raise ValueError(
            "Only for {}".format(
                ",".join(map(lambda x: x.__name__, klasses))
            )
        )
    else:
        result = retrieve_allowed_objects(
            request, scope, type(id).objects.filter(id=id.id)
        )
    return result
