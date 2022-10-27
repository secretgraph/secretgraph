import base64
import json
import logging
from typing import Optional
from strawberry_django_plus import relay
from functools import reduce, partial
from itertools import islice
from operator import or_

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.apps import apps
from django.db import models
from django.conf import settings
from django.utils import timezone

from ...core import constants
from ..actions.handler import ActionHandler
from ..models import Action, Cluster, Content, GlobalGroupProperty
from .misc import calculate_hashes

logger = logging.getLogger(__name__)


_cached_classes = {"Content", "Cluster", "Action"}


class LazyViewResult(object):
    _result_dict = None

    def __init__(self, fn, request, *viewResults, authset=None):
        self._result_dict = {}
        self.request = request
        self.authset = authset
        self.fn = fn
        for r in viewResults:
            self._result_dict[r["objects"].model.__name__] = r
        if self.authset is None:
            self.authset = (
                getattr(request, "headers", {})
                .get("Authorization", "")
                .replace(" ", "")
                .split(",")
            )

    def __getitem__(self, item):
        if item == "authset":
            return self.authset
        if item not in self._result_dict:
            self._result_dict[item] = self.fn(
                self.request,
                item,
                authset=self.authset,
            )
        return self._result_dict[item]

    def get(self, item, default=None):
        try:
            return self.__getitem__(item)
        except KeyError:
            return default


def retrieve_allowed_objects(request, query, scope="view", authset=None):
    if isinstance(query, str):
        query = apps.get_model("secretgraph", query).objects.all()

    if authset is None:
        authset = (
            getattr(request, "headers", {})
            .get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
    authset = set(islice(authset, 100))
    now = timezone.now()
    # cleanup expired Contents
    Content.objects.filter(markForDestruction__lte=now).delete()
    # cleanup expired Clusters afterward
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
    if issubclass(query.model, Content):
        pre_filtered_actions = pre_filtered_actions.filter(
            models.Q(contentAction__isnull=True)
            | models.Q(contentAction__content__in=query)
        ).select_related("cluster")
    returnval = {
        "authset": authset,
        "scope": scope,
        "rejecting_action": None,
        "decrypted": {},
        "active_actions": set(),
        "actions": Action.objects.none(),
        "action_key_map": {},
        # {id: {(action, hash): id}}  # noqa
        "action_info_clusters": {},
        "action_info_contents": {},
    }
    clusters = {}
    passive_active_actions = set()
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
        if issubclass(query.model, Cluster):
            # don't block auth with @system
            q |= models.Q(cluster__name_cached=flexid_raw)
        actions = pre_filtered_actions.filter(q, keyHash__in=keyhashes)
        if not actions:
            continue

        filters = models.Q()
        # -1 passiv
        # 0 default
        # 1 normal
        # 2 owner
        # 3 special
        accesslevel = 0
        for action in actions:
            action_value = action.value
            # cryptography doesn't support memoryview
            if isinstance(action_value, memoryview):
                action_value = action_value.tobytes()
            action_dict = json.loads(
                aesgcm.decrypt(
                    base64.b64decode(action.nonce), action_value, None
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

                if issubclass(query.model, Content):
                    returnval["active_actions"].add(action.id)
                elif (
                    issubclass(query.model, Cluster)
                    and not action.contentAction
                ):
                    returnval["active_actions"].add(action.id)
            elif newaccesslevel < 0:
                passive_active_actions.add(action.id)

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
        if actions[0].cluster.flexid in clusters:
            oldval = clusters[actions[0].cluster.flexid]
            if oldval["accesslevel"] > accesslevel:
                continue
            elif oldval["accesslevel"] == accesslevel:
                oldval["filters"] |= filters
                oldval["actions"] |= actions
                oldval["_query"] |= _query
                continue
        clusters[actions[0].cluster.flexid] = {
            "filters": filters,
            "accesslevel": accesslevel,
            "actions": actions,
            "_query": _query,
        }
    returnval["active_actions"].update(passive_active_actions)

    # extract subqueries union them
    all_query = reduce(
        or_,
        map(lambda x: x.pop("_query"), clusters.values()),
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
            query.filter(
                _q | models.Q(globalNameRegisteredAt__isnull=False)
            ).values("id")
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
    check_content_hash=False,
    limit_ids: Optional[int] = 1,
):
    if isinstance(flexids, (str, relay.GlobalID)):
        flexids = [flexids]
    elif limit_ids:
        flexids = flexids[:limit_ids]
    # assert all(map(lambda x: isinstance(x, (str, relay.GlobalID)), flexids))
    flexids = list(map(str, flexids))
    if not flexids:
        raise ValueError("No id specified")
    filters = models.Q(flexid_cached__in=flexids) | models.Q(
        flexid__in=flexids
    )
    if check_content_hash:
        filters |= models.Q(contentHash__in=flexids)
    if issubclass(query.model, Cluster):
        # name__startswith="@" allows
        # also selecting @system even it is not public
        filters |= (
            models.Q(name_cached__in=flexids) | models.Q(name__in=flexids)
        ) & models.Q(name__startswith="@")
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
            type_name, flexid = relay.from_base64(id)
        elif isinstance(id, relay.GlobalID):
            type_name, flexid = id.type_name, id.node_id
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
            results[type_name] = get_cached_result(request, authset=authset)[
                type_name
            ].copy()
            results[type_name]["objects"] = results[type_name][
                "objects"
            ].filter(flexid__in=flexids)
        else:
            results[type_name] = retrieve_allowed_objects(
                request,
                klass.objects.filter(flexid__in=flexids)
                if flexids
                else klass.objects.none(),
                scope=scope,
                authset=authset,
            )
    return results


def check_permission(request, permission, query, authset=None):
    assert issubclass(query.model, Cluster), (
        "Not a cluster query: %s" % query.model
    )
    global_groups = GlobalGroupProperty.objects.get_or_create(
        name=permission, defaults={}
    )[0].groups.all()
    q = models.Q(clusters__in=query)
    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        global_groups_names = global_groups.filter(
            matchUserGroup=True
        ).values_list("name", flat=True)
        if global_groups_names:
            q |= models.Q(
                clusters__in=models.Subquery(
                    query.filter(
                        user__group__name__in=global_groups_names
                    ).values("id")
                )
            )
            user = getattr(request, "user", None)
            if user:
                q |= models.Q(
                    name__in=models.Subquery(user.groups.values("name"))
                )

    return global_groups.filter(q).exists()


def check_default_permission(permission):
    global_groups = GlobalGroupProperty.objects.get_or_create(
        name=permission, defaults={}
    )[0].groups.all()
    return global_groups.filter(
        models.Exists(
            GlobalGroupProperty.objects.filter(
                groups__id=models.OuterRef("pk"), name="default"
            )
        )
    ).exists()


def get_cached_result(
    request,
    *viewResults,
    authset=None,
    scope="view",
    name="secretgraphResult",
    ensureExistance=False,
):
    if not getattr(request, name, None):
        if ensureExistance:
            raise AttributeError("cached query result does not exist")
        setattr(
            request,
            name,
            LazyViewResult(
                partial(retrieve_allowed_objects, scope=scope),
                request,
                *viewResults,
                authset=authset,
            ),
        )
    return getattr(request, name)


def get_cached_permissions(
    request,
    permissions_name="secretgraphPermissions",
    result_name="secretgraphResult",
    authset=None,
    ensureExistance=False,
):
    if not getattr(request, permissions_name, None):
        if ensureExistance:
            raise AttributeError("cached permissions does not exist")
        if not authset:
            authset = get_cached_result(
                request, name=result_name, ensureExistance=ensureExistance
            )["authset"]
        query = retrieve_allowed_objects(
            request,
            Cluster.objects.all(),
            scope="manage",
            authset=authset,
        )["objects"]
        setattr(
            request,
            permissions_name,
            LazyViewResult(
                partial(check_permission, query=query),
                request,
                authset=authset,
            ),
        )
    return getattr(request, permissions_name)
