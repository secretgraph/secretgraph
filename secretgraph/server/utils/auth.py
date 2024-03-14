from __future__ import annotations

import asyncio
import base64
import json
import logging
from functools import partial, reduce
from itertools import chain, islice
from operator import or_
from typing import TYPE_CHECKING, Iterable, Optional, cast

from asgiref.sync import async_to_sync, sync_to_async
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.apps import apps
from django.conf import settings
from django.db import models
from django.middleware.csrf import CsrfViewMiddleware
from django.utils import timezone
from strawberry import relay

from ...core import constants
from ...core.utils.crypto import decrypt
from ..actions.handler import ActionHandler
from ..models import Action, Cluster, Content, Net, NetGroup, SGroupProperty
from .hashing import calculateHashes

if TYPE_CHECKING:
    from django.http import HttpRequest

    from ...core.typings import Scope
    from ..typings import AllowedObjectsResult

logger = logging.getLogger(__name__)


class LazyViewResult(object):
    _result_dict = None

    def __init__(
        self,
        fn,
        request: HttpRequest,
        *viewResults: list[AllowedObjectsResult],
        authset=None,
    ):
        self._result_dict = {}
        self.request = request
        self.authset = authset
        self.fn = fn
        self.sync_fn = async_to_sync(self.fn)
        for r in viewResults:
            self._result_dict[r["objects_with_public"].model.__name__] = r
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
            self._result_dict[item] = self.sync_fn(
                self.request,
                item,
                authset=self.authset,
            )
        return self._result_dict[item]

    async def aat(self, item):
        if item == "authset":
            return self.authset

        if item not in self._result_dict:
            self._result_dict[item] = await self.fn(
                self.request,
                item,
                authset=self.authset,
            )
        return self._result_dict[item]

    def refresh(self, *fields):
        for i in fields:
            if i in self._result_dict:
                del self._result_dict[i]

    async def _wait_when_exist(self, ops):
        if not ops:
            return
        await asyncio.wait(ops)

    def preinit(self, *fields, refresh=False):
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = None
        ops = []
        for i in fields:
            if refresh and i in self._result_dict:
                del self._result_dict[i]
            if i not in self._result_dict:
                if not loop:
                    self[i]
                else:
                    ops.append(asyncio.ensure_future(self.aat(i)))
        if loop:
            return self._wait_when_exist(ops)


_valid_lengths = {32, 50}


async def _parse_token(token: str):
    spitem = token.split(":", 1)
    if len(spitem) != 2:
        return None, None, None

    flexid_raw, action_key = spitem
    try:
        action_key = base64.b64decode(action_key)
    finally:
        if not isinstance(action_key, bytes) or len(action_key) not in _valid_lengths:
            return None, None, None
    return (
        flexid_raw,
        action_key[-32:],
        await calculateHashes((b"secretgraph", action_key)),
    )


async def _speedup_tokenparsing(
    request: HttpRequest, token: str
) -> tuple[str, AESGCM, list[str]]:
    if not token:
        return None, None, None
    if not hasattr(request, "_secretgraph_token_cache"):
        setattr(request, "_secretgraph_token_cache", {})
    if token not in request._secretgraph_token_cache:
        result = await _parse_token(token)
        request._secretgraph_token_cache[token] = result
        return result
    return request._secretgraph_token_cache[token]


async def stub_retrieve_allowed_objects(
    request: HttpRequest,
    query: models.QuerySet | str,
    scope: Scope = "view",
    authset: Iterable[str] | set[str] = None,
    query_call: str = "all",
) -> AllowedObjectsResult:
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
        raise ValueError("Too many authorization tokens specified, limit is 100")

    if isinstance(query, str):
        query = getattr(apps.get_model("secretgraph", query).objects, query_call)()

    return {
        "authset": authset,
        "scope": scope,
        "rejecting_action": None,
        "action_results": {},
        "active_actions": set(),
        "actions": Action.objects.none(),
        # {id: {(action, hash): id}}  # noqa
        "action_info_clusters": {},
        "action_info_contents": {},
        "accesslevel": 0,
        "objects_with_public": query,
        "objects_without_public": query,
    }


async def retrieve_allowed_objects(
    request: HttpRequest,
    query: models.QuerySet | str,
    scope: Scope = "view",
    authset: Optional[Iterable[str] | set[str]] = None,
    ignore_restrictions: bool = False,
) -> AllowedObjectsResult:
    if authset is None:
        authset = set(
            getattr(request, "headers", {})
            .get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        # authset can contain: ""
        authset.discard("")
    elif not isinstance(authset, set):
        authset = set(authset)

    if len(authset) > 100:
        raise ValueError("Too many authorization tokens specified, limit is 100")
    if isinstance(query, str):
        query = apps.get_model("secretgraph", query).objects.all()
        need_query_restriction = False
    else:
        need_query_restriction = bool(query.query.has_filters())
    now = timezone.now()
    # for sorting. First action is always the most important action
    # importance is higher by start date, newest (here id)
    pre_filtered_actions = Action.objects.select_related(
        "cluster", "contentAction"
    ).order_by("-start", "-id")
    if not ignore_restrictions:
        pre_filtered_actions = pre_filtered_actions.filter(
            cluster__net__active=True, start__lte=now
        ).filter(models.Q(stop__isnull=True) | models.Q(stop__gte=now))
    # if the query is not the all query
    if need_query_restriction:
        if issubclass(query.model, Content):
            related_cluster_query = Cluster.objects.filter(
                models.Exists(query.filter(cluster_id=models.OuterRef("id")))
            )
            pre_filtered_actions = pre_filtered_actions.filter(
                models.Q(
                    contentAction__isnull=True,
                    cluster_id__in=models.Subquery(related_cluster_query.values("id")),
                )
                | models.Q(contentAction__content__in=query)
            )
        elif issubclass(query.model, Cluster):
            pre_filtered_actions = pre_filtered_actions.filter(cluster__in=query)
    # only show non content actions
    if issubclass(query.model, Cluster):
        pre_filtered_actions = pre_filtered_actions.filter(contentAction__isnull=True)

    returnval = {
        "authset": authset,
        "scope": scope,
        "rejecting_action": None,
        "action_results": {},
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
        flexid_cached, aesgcm, keyhashes = await _speedup_tokenparsing(request, item)
        if not aesgcm:
            continue

        q = models.Q(contentAction__content__flexid_cached=flexid_cached) | models.Q(
            cluster__flexid_cached=flexid_cached
        )
        if issubclass(query.model, Cluster):
            # don't block auth with encoded @system
            q |= models.Q(cluster__name_cached=flexid_cached)
        # execute every action only once
        actions = (
            pre_filtered_actions.filter(q, keyHash__in=keyhashes)
            .exclude(id__in=returnval["action_results"].keys())
            .select_related("contentAction")
        )
        if not await actions.aexists():
            continue

        filters = models.Q()
        # -1 passiv
        # 0 default
        # 1 normal
        # 2 owner
        # 3 special
        accesslevel = 0
        async for action in actions:
            action_dict = json.loads(
                (
                    await decrypt(
                        aesgcm,
                        action.value,
                        params={"nonce": action.nonce},
                        algorithm="AESGCM",
                    )
                ).data.decode("utf8")
            )
            action_result = await ActionHandler.handle_action(
                query.model,
                action_dict,
                scope=scope,
                action=action,
                accesslevel=accesslevel,
                request=request,
                authset=authset,
            )
            if action_result is None:
                continue
            if action_result is False:
                returnval["rejecting_action"] = (action, action_dict)
                returnval["objects_with_public"] = query.none()
                returnval["objects_without_public"] = query.none()
                return returnval
            # don't create too many empty objects, so don't use setdefault
            if hasattr(action, "contentAction"):
                action_info_dict_ref = returnval["action_info_contents"].get(
                    action.contentAction.content_id
                )
                if action_info_dict_ref is None:
                    action_info_dict_ref = {}
                    returnval["action_info_contents"][
                        action.contentAction.content_id
                    ] = action_info_dict_ref
            else:
                action_info_dict_ref = returnval["action_info_clusters"].get(
                    action.cluster_id
                )
                if action_info_dict_ref is None:
                    action_info_dict_ref = {}
                    returnval["action_info_clusters"][action.cluster_id] = (
                        action_info_dict_ref
                    )
            returnval["action_results"].setdefault(action.id, action_result)

            newaccesslevel = action_result["accesslevel"]
            if accesslevel < newaccesslevel:
                accesslevel = newaccesslevel
                filters = action_result.get("filters", models.Q())

                action_info_dict_ref[(action_dict["action"], action.keyHash)] = [
                    action.id
                ]
                returnval["active_actions"] = set()
            elif accesslevel == newaccesslevel:
                filters &= action_result.get("filters", models.Q())
                action_info_dict_ref.setdefault(
                    (action_dict["action"], action.keyHash),
                    [],
                ).append(action.id)
            if accesslevel <= newaccesslevel:
                if issubclass(query.model, Content):
                    returnval["active_actions"].add(action.id)
                elif issubclass(query.model, Cluster) and not hasattr(
                    action, "contentAction"
                ):
                    returnval["active_actions"].add(action.id)
            elif newaccesslevel < 0:
                passive_active_actions.add(action.id)

            # update hash to newest algorithm
            if action.keyHash != keyhashes[0]:
                await Action.objects.filter(keyHash=action.keyHash).aupdate(
                    keyHash=keyhashes[0]
                )

        returnval["actions"] |= actions
        # apply filters to a private query
        # filters are applied per keyHash
        if issubclass(query.model, Cluster):
            _query = query.filter(filters & models.Q(id=actions[0].cluster_id))
        else:
            _query = query.filter(filters & models.Q(cluster_id=actions[0].cluster_id))
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
            [val async for val in updatedActions.values_list("id", flat=True)]
        )
        await updatedActions.aupdate(used=now)

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
            }
        ) | models.Q(id__in=models.Subquery(all_query.values("id")))
        # in view, we can see @system contents
        if scope == "view":
            _q_public = _q | models.Q(name__startswith="@")
        else:
            _q_public = _q | models.Q(globalNameRegisteredAt__isnull=False)

        id_subquery = models.Subquery(query.filter(_q_public).values("id"))
        id_subquery_without_public = models.Subquery(query.filter(_q).values("id"))
    elif issubclass(query.model, Content):
        _q = models.Q(id__in=models.Subquery(all_query.values("id"))) & (
            models.Q(id__in=list(returnval["action_info_contents"].keys()))
            | models.Q(cluster_id__in=list(returnval["action_info_clusters"].keys()))
        )

        _q_public = models.Q(state__in=constants.public_states)
        if scope != "view":
            _q_public &= ~models.Q(cluster__name="@system")

        id_subquery = models.Subquery(query.filter(_q_public | _q).values("id"))

        id_subquery_without_public = models.Subquery(query.filter(_q).values("id"))
    else:
        assert issubclass(query.model, Action), "invalid type %r" % query.model
        id_subquery = models.Subquery(all_query.values("id"))
        id_subquery_without_public = id_subquery
    returnval["objects_with_public"] = query.filter(id__in=id_subquery)
    returnval["objects_without_public"] = query.filter(
        id__in=id_subquery_without_public
    )
    return returnval


sync_retrieve_allowed_objects = async_to_sync(retrieve_allowed_objects)


def fetch_by_id_noconvert(
    query: models.QuerySet,
    flexids: tuple[str] | set[str] | list[str],
    /,
    check_long=True,  # can be set to false in case of only short names and ids
    check_short_id=False,
    check_short_name=False,
) -> models.QuerySet:
    """Speed optimized fetch_by_id in case data is in right format"""
    # empty tuple => shortcut
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
        flexids = (flexids,)
    # speedup in case None or no flexids were specified
    if not flexids:
        return query.none()
    # assert all(map(lambda x: isinstance(x, (str, relay.GlobalID)), flexids))
    if limit_ids:
        flexids = islice(flexids, limit_ids)
    flexids = tuple(map(str, flexids))
    return fetch_by_id_noconvert(
        query,
        flexids,
        check_long=check_long,
        check_short_id=check_short_id,
        check_short_name=check_short_name,
    )


async def ids_to_results(
    request,
    ids,
    klasses,
    scope,
    cacheName,
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
    flexid_d: dict[str, set[str]] = {}
    for id in ids:
        if isinstance(id, str):
            if id.startswith("@"):
                type_name, flexid = "Cluster", id
            else:
                type_name, flexid = relay.from_base64(id)
        elif isinstance(id, relay.GlobalID):
            type_name, flexid = id.type_name, id.node_id
        elif isinstance(id, klasses):
            flexid = cast(str, id.flexid)
            # FIXME: can be incorrect
            type_name: str = type(id).__name__
        else:
            raise ValueError(
                "Only for {}. Provided: {}".format(",".join(klasses_d.keys()), id)
            )

        if type_name not in klasses_d:
            raise ValueError("Only for {} (ids)".format(",".join(klasses_d.keys())))
        flexid_d.setdefault(type_name, set()).add(flexid)
    results = {}
    for type_name, klass in klasses_d.items():
        flexids = flexid_d.get(type_name, set())
        if not initialize_missing and not flexids:
            pass
        elif cacheName:
            results[type_name] = (
                await get_cached_result(
                    request, authset=authset, cacheName=cacheName
                ).aat(type_name)
            ).copy()
            results[type_name]["objects_with_public"] = fetch_by_id_noconvert(
                results[type_name]["objects_with_public"],
                flexids,
                check_long=False,
                check_short_id=True,
                check_short_name=True,
            )
            results[type_name]["objects_without_public"] = fetch_by_id_noconvert(
                results[type_name]["objects_without_public"],
                flexids,
                check_long=False,
                check_short_id=True,
                check_short_name=True,
            )
        else:
            results[type_name] = await retrieve_allowed_objects(
                request,
                fetch_by_id_noconvert(
                    klass.objects.all(),
                    flexids,
                    check_long=False,
                    check_short_id=True,
                    check_short_name=True,
                )
                if flexids
                else klass.objects.none(),
                scope=scope,
                authset=authset,
            )
    return results


def get_cached_result(
    request,
    *viewResults,
    authset=None,
    scope="view",
    cacheName="secretgraphResult",
    ensureInitialized=False,
    stub: Optional[str] = None,
) -> LazyViewResult:
    if not isinstance(getattr(request, cacheName, None), LazyViewResult):
        if ensureInitialized:
            raise AttributeError("cached query results does not exist")
        setattr(
            request,
            cacheName,
            LazyViewResult(
                partial(stub_retrieve_allowed_objects, scope=scope, query_call=stub)
                if stub
                else partial(retrieve_allowed_objects, scope=scope),
                request,
                *viewResults,
                authset=authset,
            ),
        )
    return getattr(request, cacheName)


def match_host_origin(request):
    origin_header = request.headers.get("Origin")
    if not origin_header:
        return False
    return f"{request.scheme}://{request.get_host()}" == origin_header


class CsrfValidator(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


_csfr_middleware = CsrfValidator(lambda x: None)


def check_csrf_token(request):
    # simply check if csfr was active and successful, no matter if it is active
    reason = _csfr_middleware.process_view(request, None, (), {})
    if reason:
        return False
    return True


# use only user when same origin
# disabling this should ensure that csrf is active
async def aget_user(
    request,
    validate_origin=True,
):
    if validate_origin:
        if not match_host_origin(request) and not check_csrf_token(request):
            return None
    auser = getattr(request, "auser", None)
    if auser:
        user = await auser()
        if getattr(user, "is_authenticated", False):
            return user
    return None


async def _aget_net_properties_q(request, query, use_user_nets, user_validate_origin):
    assert issubclass(query.model, (Cluster, Net)), (
        "Not a cluster/net query: %s" % query.model
    )
    q = (
        models.Q(nets__in=query)
        if issubclass(query.model, Net)
        else models.Q(nets__primaryCluster__in=query)
    )
    if use_user_nets:
        user = await aget_user(request, validate_origin=user_validate_origin)
        if user:
            q |= models.Q(nets__user_name=user.get_username())
    return q


# note there is an cookie attack surface with SECRETGRAPH_USE_USER=True
# this is mitigated by csrf or user_from_same_origin_only=True
# only disable when the check is already done otherwise
async def aget_cached_net_properties(
    request,
    permissions_name="secretgraphNetProperties",
    result_name="secretgraphResult",
    authset=None,
    ensureInitialized=False,
    use_user_nets=None,
    user_validate_origin=True,
    scope="admin",
) -> frozenset[str]:
    if getattr(request, permissions_name, None) is None:
        if ensureInitialized:
            raise AttributeError("cached properties does not exist")
        if not authset:
            # initialize cached results and retrieve authset
            authset = get_cached_result(
                request,
                cacheName=result_name,
            )["authset"]
        query = (
            await retrieve_allowed_objects(
                request,
                Cluster.objects.filter(markForDestruction__isnull=True),
                scope=scope,
                authset=authset,
            )
        )["objects_without_public"]
        if use_user_nets is None:
            use_user_nets = getattr(settings, "SECRETGRAPH_USE_USER", True)
        net_groups = NetGroup.objects.filter(
            await _aget_net_properties_q(
                request,
                query,
                use_user_nets=use_user_nets,
                user_validate_origin=user_validate_origin,
            )
        )
        all_props = frozenset(
            [
                val
                async for val in SGroupProperty.objects.filter(
                    netGroups__in=net_groups
                ).values_list("name", flat=True)
            ]
        )
        setattr(
            request,
            permissions_name,
            all_props,
        )
    return getattr(request, permissions_name)


get_cached_net_properties = async_to_sync(aget_cached_net_properties)


def update_cached_net_properties(
    request,
    *,
    groups=None,
    properties=None,
    permissions_name="secretgraphNetProperties",
    emptyOk=False,
):
    if getattr(request, permissions_name, None) is None:
        if emptyOk:
            setattr(request, permissions_name, frozenset())
        else:
            raise AttributeError("cached properties does not exist")
    if groups:
        group_properties = SGroupProperty.objects.filter(
            netGroups__in=groups
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


aupdate_cached_net_properties = sync_to_async(update_cached_net_properties)


async def ain_cached_net_properties_or_user_special(
    request,
    *properties,
    check_net=None,
    use_is_superuser=None,
    use_check_net=None,
    user_validate_origin=True,
    **kwargs,
):
    user = None
    if use_is_superuser is None:
        use_is_superuser = getattr(settings, "SECRETGRAPH_USE_USER", True)
    if use_check_net:
        use_check_net = getattr(settings, "SECRETGRAPH_USE_USER", True)
    user = None
    if use_is_superuser or check_net:
        user = await aget_user(request, validate_origin=user_validate_origin)
    if use_is_superuser:
        if user and getattr(user, "is_superuser", False):
            return True
    if use_check_net:
        if user and check_net and await check_net.auser() == user:
            return True
    return not (
        await aget_cached_net_properties(
            request, user_validate_origin=user_validate_origin, **kwargs
        )
    ).isdisjoint(properties)


in_cached_net_properties_or_user_special = async_to_sync(
    ain_cached_net_properties_or_user_special
)
