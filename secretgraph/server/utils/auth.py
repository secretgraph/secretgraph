from __future__ import annotations

import base64
import json
import logging
from itertools import islice
from typing import TYPE_CHECKING, Iterable, Optional
from strawberry_django_plus import relay, gql
from functools import reduce, partial
from itertools import chain
from operator import or_

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.db import models
from django.conf import settings
from django.apps import apps
from django.utils import timezone

from ...core import constants
from ..actions.handler import ActionHandler
from ..models import (
    Action,
    Cluster,
    Content,
    GlobalGroup,
    GlobalGroupProperty,
)
from .hashing import calculateHashes

if TYPE_CHECKING:
    from ...core import typings
    from django.http import HttpRequest

logger = logging.getLogger(__name__)


_cached_classes = {"Content", "Cluster", "Action"}


class LazyViewResult(object):
    _result_dict = None

    def __init__(self, fn, request: HttpRequest, *viewResults, authset=None):
        self._result_dict = {}
        self.request = request
        self.authset = authset
        self.fn = fn
        for r in viewResults:
            self._result_dict[r["objects"].model.__name__] = r
        if self.authset is None:
            self.authset = set(
                getattr(request, "headers", {})
                .get("Authorization", "")
                .replace(" ", "")
                .split(",")
            )
            self.authset.discard("")

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

    def refresh(self, *fields):
        for i in fields:
            if i in self._result_dict:
                del self._result_dict[i]

    @gql.django.django_resolver
    def preinit(self, *fields, refresh=False):
        for i in fields:
            if refresh and i in self._result_dict:
                del self._result_dict[i]
            self[i]


def _parse_token(token: str):
    spitem = token.split(":", 1)
    if len(spitem) != 2:
        return None, None, None

    flexid_raw, action_key = spitem
    try:
        action_key = base64.b64decode(action_key)
    finally:
        if not isinstance(action_key, bytes) or len(action_key) != 32:
            return None, None, None
    return (
        flexid_raw,
        AESGCM(action_key),
        calculateHashes(action_key),
    )


def _speedup_tokenparsing(
    request: HttpRequest, token: str
) -> tuple[str, AESGCM, list[str]]:
    if not token:
        return None, None, None
    if not hasattr(request, "_secretgraph_token_cache"):
        setattr(request, "_secretgraph_token_cache", {})
    if token not in request._secretgraph_token_cache:
        result = _parse_token(token)
        request._secretgraph_token_cache[token] = result
        return result
    return request._secretgraph_token_cache[token]


def stub_retrieve_allowed_objects(
    request: HttpRequest,
    query: models.QuerySet | str,
    scope: typings.Scope = "view",
    authset: Iterable[str] | set[str] = None,
    query_call: str = "all",
):
    if authset is None:
        authset = set(
            getattr(request, "headers", {})
            .get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.discard("")
    elif not isinstance(authset, set):
        authset = set(authset)

    if len(authset) > 100:
        raise ValueError(
            "Too many authorization tokens specified, limit is 100"
        )

    if isinstance(query, str):
        query = getattr(
            apps.get_model("secretgraph", query).objects, query_call
        )()

    return {
        "authset": authset,
        "scope": scope,
        "rejecting_action": None,
        "decrypted": {},
        "active_actions": set(),
        "actions": Action.objects.none(),
        # {id: {(action, hash): id}}  # noqa
        "action_info_clusters": {},
        "action_info_contents": {},
        "accesslevel": 0,
        "objects": query,
        "objects_ignore_public": query,
    }


def retrieve_allowed_objects(
    request: HttpRequest,
    query: models.QuerySet | str,
    scope: typings.Scope = "view",
    authset: Optional[Iterable[str] | set[str]] = None,
    ignore_restrictions: bool = False,
):
    if authset is None:
        authset = set(
            getattr(request, "headers", {})
            .get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.discard("")
    elif not isinstance(authset, set):
        authset = set(authset)

    if len(authset) > 100:
        raise ValueError(
            "Too many authorization tokens specified, limit is 100"
        )
    if isinstance(query, str):
        query = apps.get_model("secretgraph", query).objects.all()
    now = timezone.now()
    # for sorting. First action is always the most important action
    # importance is higher by start date, newest (here id)
    pre_filtered_actions = Action.objects.select_related("cluster").order_by(
        "-start", "-id"
    )
    if not ignore_restrictions:
        pre_filtered_actions = pre_filtered_actions.filter(
            cluster__net__active=True, start__lte=now
        ).filter(models.Q(stop__isnull=True) | models.Q(stop__gte=now))
    if issubclass(query.model, Content):
        pre_filtered_actions = pre_filtered_actions.filter(
            models.Q(contentAction__isnull=True)
            | models.Q(contentAction__content__in=query)
        )
    returnval = {
        "authset": authset,
        "scope": scope,
        "rejecting_action": None,
        "decrypted": {},
        "active_actions": set(),
        "actions": Action.objects.none(),
        # {id: {(action, hash): id}}  # noqa
        "action_info_clusters": {},
        "action_info_contents": {},
        "accesslevel": 0,
    }
    query_composing = {}
    passive_active_actions = set()
    for item in authset:
        flexid_cached, aesgcm, keyhashes = _speedup_tokenparsing(request, item)
        if not aesgcm:
            continue

        q = models.Q(
            contentAction__content__flexid_cached=flexid_cached
        ) | models.Q(cluster__flexid_cached=flexid_cached)
        if issubclass(query.model, Cluster):
            # don't block auth with @system
            q |= models.Q(cluster__name_cached=flexid_cached)
        # execute every action only once
        actions = pre_filtered_actions.filter(
            q, keyHash__in=keyhashes
        ).exclude(id__in=returnval["decrypted"].keys())
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
                action_info_dict_ref = returnval[
                    "action_info_contents"
                ].setdefault(action.contentAction.content_id, {})
            else:
                action_info_dict_ref = returnval[
                    "action_info_clusters"
                ].setdefault(action.cluster_id, {})
            returnval["decrypted"].setdefault(action.id, decrypted)

            newaccesslevel = decrypted["accesslevel"]
            if accesslevel < newaccesslevel:
                accesslevel = newaccesslevel
                filters = decrypted.get("filters", models.Q())

                action_info_dict_ref[
                    (action_dict["action"], action.keyHash)
                ] = [action.id]
                returnval["active_actions"] = set()
            elif accesslevel == newaccesslevel:
                filters &= decrypted.get("filters", models.Q())
                action_info_dict_ref.setdefault(
                    (action_dict["action"], action.keyHash),
                    [],
                ).append(action.id)
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
        # apply filters to a private query
        # filters are applied per keyHash
        if issubclass(query.model, Cluster):
            _query = query.filter(filters & models.Q(id=actions[0].cluster_id))
        else:
            _query = query.filter(
                filters & models.Q(cluster_id=actions[0].cluster_id)
            )
        if returnval["accesslevel"] < accesslevel:
            returnval["accesslevel"] = accesslevel
        if actions[0].cluster.flexid in query_composing:
            oldval = query_composing[actions[0].cluster.flexid]
            if oldval["accesslevel"] > accesslevel:
                continue
            elif oldval["accesslevel"] == accesslevel:
                oldval["query"] |= _query
                continue
        query_composing[actions[0].cluster.flexid] = {
            "accesslevel": accesslevel,
            "query": _query,
        }
    # actions
    returnval["active_actions"].update(passive_active_actions)
    # for sorting. First action is always the most important action
    # importance is higher by start date, newest (here id)
    returnval["actions"] = Action.objects.filter(
        id__in=models.Subquery(returnval["actions"].values("id"))
    ).order_by("-start", "-id")

    # active actions are only marked as used if scope is not peek
    if scope != "peek":
        updatedActions = returnval["actions"].filter(
            id__in=returnval["active_actions"], used__isnull=True
        )
        setattr(
            request,
            "secretgraphActionsToRollback",
            getattr(request, "secretgraphActionsToRollback", set()),
        )
        request.secretgraphActionsToRollback.update(
            updatedActions.values_list("id", flat=True)
        )
        updatedActions.update(used=now)

    # extract subqueries union them
    all_query = reduce(
        or_,
        map(lambda x: x["query"], query_composing.values()),
        query.none(),
    )
    del query_composing

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
    returnval["objects"] = query.filter(id__in=id_subquery)
    returnval["objects_ignore_public"] = query.filter(
        id__in=id_subquery_without_public
    )
    return returnval


def fetch_by_id(
    query: models.QuerySet,
    flexids: Iterable[str | relay.GlobalID] | str | relay.GlobalID,
    /,
    check_long=True,  # can be set to false in case of only short names and ids
    check_short_id=False,
    check_short_name=False,
    limit_ids: Optional[int] = 1,
) -> models.QuerySet:
    if flexids and isinstance(flexids, (str, relay.GlobalID)):
        flexids = [flexids]
    # speedup in case None or no flexids were specified
    if not flexids:
        return query.none()
    # assert all(map(lambda x: isinstance(x, (str, relay.GlobalID)), flexids))
    if limit_ids:
        flexids = islice(flexids, limit_ids)
    flexids = list(map(str, flexids))
    # empty list => shortcut
    if not flexids:
        return query.none()
    filters = models.Q()
    if check_long:
        filters |= models.Q(flexid_cached__in=flexids)
    if check_short_id:
        filters |= models.Q(flexid__in=flexids)
    if issubclass(query.model, Cluster):
        # also allow selecting global names
        # name__startswith="@" allows
        # also selecting @system even it is not public
        _q = models.Q()
        if check_long:
            _q |= models.Q(name_cached__in=flexids)
        if check_short_name:
            _q |= models.Q(name__in=flexids)
        filters |= _q & models.Q(name__startswith="@")
    return query.filter(filters)


def ids_to_results(
    request,
    ids,
    klasses,
    scope="view",
    authset=None,
    initialize_missing=True,
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
            if id.startswith("@"):
                type_name, flexid = "Cluster", id
            else:
                type_name, flexid = relay.from_base64(id)
        elif isinstance(id, relay.GlobalID):
            type_name, flexid = id.type_name, id.node_id
        elif isinstance(id, klasses):
            flexid = id.flexid
            # FIXME: can be incorrect
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
            results[type_name]["objects"] = fetch_by_id(
                results[type_name]["objects"],
                flexids,
                check_long=False,
                check_short_id=True,
                check_short_name=True,
                limit_ids=None,
            )
        else:
            results[type_name] = retrieve_allowed_objects(
                request,
                fetch_by_id(
                    klass.objects.all(),
                    flexids,
                    check_long=False,
                    check_short_id=True,
                    check_short_name=True,
                    limit_ids=None,
                )
                if flexids
                else klass.objects.none(),
                scope=scope,
                authset=authset,
            )
    return results


def get_properties_q(request, query):
    assert issubclass(query.model, Cluster), (
        "Not a cluster query: %s" % query.model
    )
    q = models.Q(clusters__in=query)
    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        global_groups_names = GlobalGroup.objects.filter(
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
    return q


def get_cached_result(
    request,
    *viewResults,
    authset=None,
    scope="view",
    name="secretgraphResult",
    ensureInitialized=False,
    stub: Optional[str] = None,
) -> LazyViewResult:
    if not getattr(request, name, None):
        if ensureInitialized:
            raise AttributeError("cached query results does not exist")
        setattr(
            request,
            name,
            LazyViewResult(
                partial(
                    stub_retrieve_allowed_objects, scope=scope, query_call=stub
                )
                if stub
                else partial(retrieve_allowed_objects, scope=scope),
                request,
                *viewResults,
                authset=authset,
            ),
        )
    return getattr(request, name)


def get_cached_properties(
    request,
    permissions_name="secretgraphProperties",
    result_name="secretgraphResult",
    authset=None,
    ensureInitialized=False,
) -> frozenset[str]:
    if getattr(request, permissions_name, None) is None:
        if ensureInitialized:
            raise AttributeError("cached properties does not exist")
        if not authset:
            # initialize cached results and retrieve authset
            authset = get_cached_result(
                request,
                name=result_name,
            )["authset"]
        query = retrieve_allowed_objects(
            request,
            Cluster.objects.all(),
            scope="manage",
            authset=authset,
        )["objects"]
        global_groups = GlobalGroup.objects.filter(
            get_properties_q(request, query)
        )
        all_props = frozenset(
            GlobalGroupProperty.objects.filter(
                groups__in=global_groups
            ).values_list("name", flat=True)
        )
        setattr(
            request,
            permissions_name,
            all_props,
        )
    return getattr(request, permissions_name)


def update_cached_properties(
    request,
    *,
    groups=None,
    properties=None,
    permissions_name="secretgraphProperties",
):
    if getattr(request, permissions_name, None) is None:
        raise AttributeError("cached properties does not exist")
    if groups:
        group_properties = GlobalGroupProperty.objects.filter(
            groups__in=groups
        ).values_list("name")
    else:
        group_properties = []
    setattr(
        request,
        permissions_name,
        frozenset(
            chain(
                getattr(request, permissions_name),
                group_properties,
                (properties or []),
            )
        ),
    )
