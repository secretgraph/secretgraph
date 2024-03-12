from datetime import datetime as dt
from datetime import timedelta as td

from django.db.models import Q
from django.utils import timezone
from strawberry import relay

from ....core import constants
from ...models import Action, Cluster, Content
from ._shared import get_forbidden_content_ids, only_owned_helper


class SideEffectsHandlers:
    @staticmethod
    async def do_inject(action_dict, scope, sender, accesslevel, **kwargs):
        if scope in {"create", "update", "push"} and issubclass(
            sender, (Content, Cluster)
        ):
            if issubclass(sender, Content):
                excl_filters_type = Q()
                if action_dict["excludeTypes"]:
                    excl_filters_type |= Q(type__in=action_dict["excludeTypes"])
                excl_filters_tag = Q()
                for i in action_dict["excludeTags"]:
                    if i.startswith("id="):
                        excl_filters_tag |= Q(flexid_cached=i[3:])
                    elif i.startswith("=id="):
                        excl_filters_tag |= Q(flexid_cached=i[4:])
                    elif i.startswith("="):
                        excl_filters_tag |= Q(tags__tag=i[1:])
                    else:
                        excl_filters_tag |= Q(tags__tag__startswith=i)

                incl_filters_type = Q()
                if action_dict["includeTypes"]:
                    incl_filters_type |= Q(type__in=action_dict["includeTypes"])
                incl_filters_state = Q()
                if action_dict["states"]:
                    incl_filters_state |= Q(state__in=action_dict["states"])

                incl_filters_tag = Q()
                for i in action_dict["includeTags"]:
                    if i.startswith("id="):
                        incl_filters_tag |= Q(flexid_cached=i[3:])
                    elif i.startswith("=id="):
                        incl_filters_tag |= Q(flexid_cached=i[4:])
                    elif i.startswith("="):
                        incl_filters_tag |= Q(tags__tag=i[1:])
                    else:
                        incl_filters_tag |= Q(tags__tag__startswith=i)
                excl_filters = excl_filters_type | excl_filters_tag
                if action_dict.get("excludeIds"):
                    excl_filters |= Q(id__in=action_dict["excludeIds"])

                return {
                    "filters": ~excl_filters,
                    "accesslevel": -1,
                    "allowedTags": action_dict.get("allowedTags", None),
                    "allowedTypes": action_dict.get("allowedTypes", None),
                    "allowedStates": action_dict.get("allowedStates", None),
                    "injectedTags": action_dict.get("injectedTags", []),
                    "injectedReferences": action_dict.get("injectedReferences", []),
                }
            else:
                return {
                    "filters": Q(),
                    "accesslevel": -1,
                    "allowedTags": action_dict.get("allowedTags", None),
                    "allowedTypes": action_dict.get("allowedTypes", None),
                    "allowedStates": action_dict.get("allowedStates", None),
                    "injectedTags": action_dict.get("injectedTags", []),
                    "injectedReferences": action_dict.get("injectedReferences", []),
                }
        return None

    @staticmethod
    async def clean_inject(action_dict, request, cluster, content, admin):
        result = {
            "id": content.id if content and content.id else None,
            "injectedTags": [],
            "injectedReferences": [],
            "allowedTags": None,
            "allowedStates": None,
            "allowedTypes": None,
        }

        if action_dict.get("includeTypes") and action_dict.get("excludeTypes"):
            raise ValueError("Either includeTypes or excludeTypes should be specified")

        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
            result["states"] = []
            result["includeTypes"] = []
            result["excludeTypes"] = []
            result["excludeIds"] = []
        else:
            result["excludeIds"] = list(await get_forbidden_content_ids(request))
            exclude_tags = action_dict.get("excludeTags", [])
            result["excludeTags"] = list(map(str, exclude_tags))
            include_tags = action_dict.get("includeTags", [])
            result["includeTags"] = list(map(str, include_tags))
            states = action_dict.get("states", [])
            result["states"] = list(map(str, states))
            exclude_types = action_dict.get("excludeTypes", [])
            result["excludeTypes"] = list(map(str, exclude_types))
            include_types = action_dict.get("includeTypes", [])
            result["includeTypes"] = list(map(str, include_types))

        if action_dict.get("injectedTags"):
            result["injectedTags"].extend(action_dict["injectedTags"])
        if action_dict.get("allowedTags") is not None:
            result["allowedTags"] = list(action_dict["allowedTags"])
        if action_dict.get("allowedStates") is not None:
            result["allowedStates"] = list(action_dict["allowedStates"])
        if action_dict.get("allowedTypes") is not None:
            result["allowedTypes"] = list(action_dict["allowedTypes"])
        references = action_dict.get("injectedReferences")
        if references:
            if isinstance(references, list):
                references = dict(map(lambda x: (x["target"], x), references))
            for _flexid, _id in await only_owned_helper(
                Content,
                references.keys(),
                request=request,
                fields=("flexid", "id"),
                admin=admin,
                scope="link",
            ):
                deleteRecursive = references[_flexid].get(
                    "deleteRecursive", constants.DeleteRecursive.TRUE.value
                )
                # TODO: specify nicer
                if deleteRecursive not in constants.DeleteRecursive.valid_values:
                    raise ValueError(
                        "invalid deleteRecursive specification " "in injected reference"
                    )
                result["injectedReferences"].append(
                    {
                        "target": _id,
                        "group": references[_flexid].get("group", ""),
                        "deleteRecursive": deleteRecursive,
                    }
                )
        return result

    @staticmethod
    async def do_storedUpdate(action_dict, scope, **kwargs):
        now = timezone.now()
        mintime = dt.strptime(action_dict["minExpire"], r"%a, %d %b %Y %H:%M:%S %z")
        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            if action_dict["delete"][type_name]:
                if type_name == "Action" or now >= mintime:
                    await klass.objects.filter(
                        id__in=action_dict["delete"][type_name]
                    ).adelete()
                elif type_name == "Content":
                    await Content.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        id__in=action_dict["delete"][type_name],
                    ).aupdate(markForDestruction=mintime)
                elif type_name == "Cluster":
                    await Content.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        cluster_id__in=action_dict["delete"][type_name],
                    ).aupdate(markForDestruction=mintime)
                    await Cluster.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        id__in=action_dict["delete"][type_name],
                    ).aupdate(markForDestruction=mintime)
            for _id, updatevalues in action_dict["update"][type_name].items():
                for k in list(updatevalues.keys()):
                    if k not in constants.storedUpdateFields[type_name]:
                        updatevalues.pop(k, None)
                await klass.objects.filter(id=_id).aupdate(updatevalues)
        return None

    @staticmethod
    async def clean_storedUpdate(action_dict, request, cluster, content, admin):
        from ...utils.auth import ain_cached_net_properties_or_user_special

        if content:
            raise ValueError("storedUpdate cannot be used as contentaction")
        if (
            not await ain_cached_net_properties_or_user_special(
                request,
                "allow_dangerous_actions",
                authset=request.secretgraphCleanResult.authset,
            )
            and "allow_dangerous_actions" not in await cluster.aproperties()
        ):
            raise ValueError("No permission to register dangerous actions")
        now_plus_x = timezone.now() + td(minutes=20)
        result = {
            "action": "storedUpdate",
            "delete": {"Cluster": [], "Content": [], "Action": []},
            "update": {"Cluster": {}, "Content": {}, "Action": {}},
            "minExpire": now_plus_x.strftime(r"%a, %d %b %Y %H:%M:%S %z"),
        }
        update_mapper = {"Cluster": {}, "Content": {}, "Action": {}}

        for idtuple in action_dict.get("delete") or []:
            if ":" in idtuple:
                type_name, id = relay.from_base64(idtuple)
                if type_name not in {"Content", "Cluster"}:
                    raise ValueError("Invalid idtype")
                result["delete"][type_name].append(id)
            else:
                result["delete"][type_name].append(idtuple)

        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            result["delete"][type_name] = list(
                await only_owned_helper(
                    klass,
                    result["delete"][type_name],
                    request,
                    check_field="keyHash" if type_name == "Action" else None,
                    only_first_field=True,
                    admin=admin,
                    scope="delete",
                )
            )

        _del_sets = {
            "Cluster": set(result["delete"]["Cluster"]),
            "Content": set(result["delete"]["Content"]),
            "Action": set(result["delete"]["Action"]),
        }

        for jsonob in action_dict.get("update") or {}:
            newob = {}
            type_name, idpart = relay.from_base64(jsonob["id"])
            for name, field_type in constants.storedUpdateFields[type_name].items():
                if name in jsonob:
                    if not isinstance(jsonob[name], field_type):
                        raise ValueError(
                            "Invalid field type (%s) for: %s"
                            % (type(jsonob[name]), name)
                        )
                    newob[name] = jsonob[name]
            update_mapper[type_name][idpart] = newob

        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            for _flexid, _id in await only_owned_helper(
                klass,
                update_mapper[type_name].keys(),
                request=request,
                fields=(("id", "id") if type_name == "Action" else ("flexid", "id")),
                admin=admin,
                scope="update",
            ):
                if _id in _del_sets[type_name]:
                    continue
                result["update"][type_name][_id] = update_mapper[type_name][_flexid]
        return result
