import base64
import json
import logging
from functools import reduce
from itertools import islice
from operator import or_

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.apps import apps
from django.db import models
from django.utils import timezone

from ... import constants
from ..actions.handler import ActionHandler
from ..models import Action, Cluster, Content
from .misc import calculate_hashes, from_global_id_safe

logger = logging.getLogger(__name__)


_cached_classes = {"Content", "Cluster", "Action"}
_allowed_auth_types = {"Cluster", "Content"}


class LazyViewResult(object):
    _result_dict = None

    def __init__(self, request, *viewResults, authset=None, scope="view"):
        self._result_dict = {}
        self.request = request
        self.authset = authset
        self.scope = scope
        for r in viewResults:
            self._result_dict[r["objects"].model.__name__] = r
        if self.authset is None:
            self.authset = (
                request.headers.get("Authorization", "")
                .replace(" ", "")
                .split(",")
            )

    def __getitem__(self, item):
        if item in _cached_classes:
            if item not in self._result_dict:
                self._result_dict[item] = retrieve_allowed_objects(
                    self.request,
                    self.scope,
                    apps.get_model("secretgraph", item).objects.all(),
                    authset=self.authset,
                )
            return self._result_dict[item]
        if item in {"authset", "scope"}:
            return self.authset
        raise KeyError()

    def get(self, item, default=None):
        try:
            return self.__getitem__(item)
        except KeyError:
            return default


def initializeCachedResult(
    request, *viewResults, authset=None, scope="view", name="secretgraphResult"
):
    if not getattr(request, name, None):
        setattr(
            request,
            name,
            LazyViewResult(
                request, *viewResults, scope=scope, authset=authset
            ),
        )
    return getattr(request, name)


def retrieve_allowed_objects(request, scope, query, authset=None):
    if authset is None:
        authset = (
            request.headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
    authset = set(islice(authset, 100))
    now = timezone.now()
    # cleanup expired Contents
    Content.objects.filter(markForDestruction__lte=now).delete()
    if query.model == Cluster:
        Cluster.objects.annotate(models.Count("contents")).filter(
            markForDestruction__lte=now, contents__count=0
        ).delete()
    # for sorting. First action is always the most important action
    # importance is higher by start date, newest (here id)
    pre_filtered_actions = (
        Action.objects.select_related("cluster")
        .filter(start__lte=now)
        .filter(models.Q(stop__isnull=True) | models.Q(stop__gte=now))
        .order_by("-start", "-id")
    )
    if isinstance(query.model, Content):
        pre_filtered_actions = pre_filtered_actions.filter(
            models.Q(contentAction__isnull=True)
            | models.Q(contentAction__content__in=query)
        ).select_related("cluster")
    returnval = {
        "authset": authset,
        "scope": scope,
        "rejecting_action": None,
        "clusters": {},
        "decrypted": {},
        "active_actions": set(),
        "actions": Action.objects.none(),
        "action_key_map": {},
        # {id: {(action, hash): id}}  # noqa
        "action_info_clusters": {},
        "action_info_contents": {},
    }
    for item in authset:
        # harden against invalid input, e.g. object view produces empty strings
        if not item:
            continue
        spitem = item.split(":", 1)
        if len(spitem) != 2:
            continue

        flexid_raw, action_key = spitem
        try:
            action_key = base64.b64decode(action_key)
        finally:
            if not isinstance(action_key, bytes) or len(action_key) != 32:
                continue
        aesgcm = AESGCM(action_key)
        keyhashes = calculate_hashes(action_key)

        q = models.Q(
            contentAction__content__flexid_cached=flexid_raw
        ) | models.Q(cluster__flexid_cached=flexid_raw)
        actions = pre_filtered_actions.filter(q, keyHash__in=keyhashes)
        if not actions:
            continue

        filters = models.Q()
        # 0 default
        # 1 normal
        # 2 owner
        # 3 special
        accesslevel = 0
        for action in actions:
            action_dict = json.loads(
                aesgcm.decrypt(
                    base64.b64decode(action.nonce), action.value, None
                )
            )
            decrypted = ActionHandler.handle_action(
                query.model,
                action_dict,
                scope=scope,
                action=action,
                accesslevel=accesslevel,
                request=request,
                authset=authset,
            )
            if decrypted is None:
                continue
            if decrypted is False:
                returnval["rejecting_action"] = (action, action_dict)
                returnval["objects"] = query.none()
                return returnval
            if action.contentAction:
                action_info_dict = returnval[
                    "action_info_contents"
                ].setdefault(action.contentAction.content_id, {})
            else:
                action_info_dict = returnval[
                    "action_info_clusters"
                ].setdefault(action.cluster_id, {})
            returnval["decrypted"].setdefault(action.id, decrypted)

            newaccesslevel = decrypted["accesslevel"]

            if accesslevel < newaccesslevel:
                accesslevel = newaccesslevel
                filters = decrypted.get("filters", models.Q())

                action_info_dict[
                    (action_dict["action"], action.keyHash)
                ] = action.id
                returnval["active_actions"] = set()
            elif accesslevel == newaccesslevel:
                filters &= decrypted.get("filters", models.Q())
                action_info_dict.setdefault(
                    (action_dict["action"], action.keyHash),
                    action.id,
                )
            if accesslevel <= newaccesslevel:

                if isinstance(query.model, Content):
                    returnval["active_actions"].add(action.id)
                elif (
                    isinstance(query.model, Cluster)
                    and not action.contentAction
                ):
                    returnval["active_actions"].add(action.id)

            # update hash to newest algorithm
            if action.keyHash != keyhashes[0]:
                Action.objects.filter(keyHash=action.keyHash).update(
                    keyHash=keyhashes[0]
                )

        returnval["actions"] |= actions
        for h in keyhashes:
            returnval["action_key_map"][h] = action_key
        # apply filters to a private query
        if issubclass(query.model, Cluster):
            _query = query.filter(filters & models.Q(id=actions[0].cluster_id))
        else:
            _query = query.filter(
                filters & models.Q(cluster_id=actions[0].cluster_id)
            )
        if actions[0].cluster.flexid in returnval["clusters"]:
            oldval = returnval["clusters"][actions[0].cluster.flexid]
            if oldval["accesslevel"] > accesslevel:
                continue
            elif oldval["accesslevel"] == accesslevel:
                oldval["filters"] |= filters
                oldval["actions"] |= actions
                oldval["_query"] |= _query
                continue
        returnval["clusters"][actions[0].cluster.flexid] = {
            "filters": filters,
            "accesslevel": accesslevel,
            "actions": actions,
            "_query": _query,
        }

    # extract subqueries union them
    all_query = reduce(
        or_,
        map(lambda x: x.pop("_query"), returnval["clusters"].values()),
        query.none(),
    )

    if issubclass(query.model, Cluster):
        _q = models.Q(
            id__in={
                *returnval["action_info_clusters"].keys(),
                *all_query.values_list("id", flat=True),
            }
        )
        id_subquery = models.Subquery(
            query.filter(_q | models.Q(public=True)).values("id")
        )
        id_subquery_without_public = models.Subquery(
            query.filter(_q).values("id")
        )
    elif issubclass(query.model, Content):
        _q = models.Q(id__in=models.Subquery(all_query.values("id"))) & (
            models.Q(id__in=list(returnval["action_info_contents"].keys()))
            | models.Q(
                cluster_id__in=list(returnval["action_info_clusters"].keys())
            )
        )
        id_subquery = models.Subquery(
            query.filter(
                models.Q(state__in=constants.public_states) | _q
            ).values("id")
        )
        id_subquery_without_public = models.Subquery(
            query.filter(_q).values("id")
        )
    else:
        assert issubclass(query.model, Action), "invalid type %r" % query.model
        id_subquery = models.Subquery(all_query.values("id"))
        id_subquery_without_public = id_subquery
    # for sorting. First action is always the most important action
    # importance is higher by start date, newest (here id)
    returnval["actions"] = Action.objects.filter(
        id__in=models.Subquery(returnval["actions"].values("id"))
    ).order_by("-start", "-id")
    returnval["objects"] = query.filter(id__in=id_subquery)
    returnval["objects_ignore_public"] = query.filter(
        id__in=id_subquery_without_public
    )
    return returnval


def fetch_by_id(
    query,
    flexids,
    prefix="",
    check_content_hash=False,
    limit_ids=1,
):
    if isinstance(flexids, str):
        flexids = [flexids]
    elif limit_ids:
        flexids = flexids[:limit_ids]
    if not flexids:
        raise ValueError("No id specified")
    filters = models.Q(**{f"{prefix}flexid_cached__in": flexids}) | models.Q(
        **{
            f"{prefix}flexid__in": flexids,  #
        }
    )
    if check_content_hash:
        filters |= models.Q(**{f"{prefix}contentHash__in": flexids})
    return query.filter(filters)


def ids_to_results(
    request, ids, klasses, scope="view", authset=None, initialize_missing=True
):
    klasses_d = {}
    if not isinstance(klasses, tuple):
        klasses_d[klasses.__name__] = klasses
    else:
        for klass in klasses:
            klasses_d[klass.__name__] = klass
    if not isinstance(ids, (tuple, list)):
        ids = (ids,)
    flexid_d = {}
    for id in ids:
        if isinstance(id, str):
            type_name, flexid = from_global_id_safe(id)
        elif isinstance(id, klasses):
            flexid = id.flexid
            type_name = type(id).__name__
        else:
            raise ValueError(
                "Only for {}. Provided: {}".format(
                    ",".join(map(lambda x: x.__name__, klasses)), id
                )
            )

        if type_name not in klasses_d:
            raise ValueError(
                "Only for {} (ids)".format(
                    ",".join(map(lambda x: x.__name__, klasses))
                )
            )
        flexid_d.setdefault(type_name, set()).add(flexid)
    results = {}
    for type_name, klass in klasses_d.items():
        flexids = flexid_d.get(type_name, set())
        if not initialize_missing and not flexids:
            pass
        elif scope == "view" and type_name in _cached_classes:
            results[type_name] = initializeCachedResult(
                request, authset=authset
            )[type_name].copy()
            results[type_name]["objects"] = results[type_name][
                "objects"
            ].filter(flexid__in=flexids)
        else:
            results[type_name] = retrieve_allowed_objects(
                request,
                scope,
                klass.objects.filter(flexid__in=flexids)
                if flexids
                else klass.objects.none(),
                authset=authset,
            )
    return results
