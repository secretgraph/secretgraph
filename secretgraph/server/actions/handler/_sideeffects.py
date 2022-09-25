import json
from datetime import datetime as dt
from datetime import timedelta as td

from django.db.models import Q
from django.utils import timezone
from strawberry_django_plus import relay

from ....core import constants
from ...models import Action, Cluster, Content
from ._shared import get_valid_fields, only_owned_helper


class SideEffectsHandlers:
    @staticmethod
    def do_inject(action_dict, scope, sender, accesslevel, **kwargs):
        if scope in {"create", "update", "push"} and issubclass(
            sender, (Content, Cluster)
        ):
            return {
                "action": "inject",
                "trustedKeys": action_dict.get("trustedKeys", []),
                "filters": Q(),
                "accesslevel": -1,
                "allowedTags": action_dict.get("allowedTags", None),
                "allowedTypes": action_dict.get("allowedTypes", None),
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedTags": action_dict.get("injectedTags", []),
                "injectedReferences": action_dict.get(
                    "injectedReferences", []
                ),
            }
        return None

    @staticmethod
    def clean_inject(action_dict, request, content, authset, admin):
        result = {
            "id": content.id if content and content.id else None,
            "injectedTags": [],
            "injectedReferences": [],
            "allowedTags": None,
            "allowedStates": None,
            "allowedTypes": None,
        }

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
            for _flexid, _id in only_owned_helper(
                Content,
                references.keys(),
                request=request,
                fields=("flexid", "id"),
                authset=authset,
                admin=admin,
            ):
                deleteRecursive = references[_flexid].get(
                    "deleteRecursive", constants.DeleteRecursive.TRUE.value
                )
                # TODO: specify nicer
                if (
                    deleteRecursive
                    not in constants.DeleteRecursive.valid_values
                ):
                    raise ValueError(
                        "invalid deleteRecursive specification "
                        "in injected reference"
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
    def do_storedUpdate(action_dict, scope, **kwargs):
        now = timezone.now()
        mintime = dt.strptime(
            action_dict["minExpire"], r"%a, %d %b %Y %H:%M:%S %z"
        )
        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            if action_dict["delete"][type_name]:
                if type_name == "Action" or now >= mintime:
                    klass.objects.filter(
                        id__in=action_dict["delete"][type_name]
                    ).delete()
                elif type_name == "Content":
                    Content.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        id__in=action_dict["delete"][type_name],
                    ).update(markForDestruction=mintime)
                elif type_name == "Component":
                    Content.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        cluster_id__in=action_dict["delete"][type_name],
                    ).update(markForDestruction=mintime)
                    Cluster.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        id__in=action_dict["delete"][type_name],
                    ).update(markForDestruction=mintime)
            for _id, updatevalues in action_dict["update"][type_name].items():
                updatevalues.pop("id", None)
                updatevalues.pop("cluster", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referencedBy", None)
                klass.objects.filter(id=_id).update(updatevalues)
        return None

    @staticmethod
    def clean_storedUpdate(action_dict, request, content, authset, admin):
        if content:
            raise ValueError("storedUpdate cannot be used as contentaction")
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
                only_owned_helper(
                    klass,
                    result["delete"][type_name],
                    request,
                    check_field="keyHash" if type_name == "Action" else None,
                    authset=authset,
                    only_first_field=True,
                    admin=admin,
                )
            )

        _del_sets = {
            "Cluster": set(result["delete"]["Cluster"]),
            "Content": set(result["delete"]["Content"]),
            "Action": set(result["delete"]["Action"]),
        }

        for jsonob in action_dict.get("update") or []:
            if isinstance(jsonob, str):
                jsonob = json.loads(jsonob)
            newob = {}
            type_name, idpart = relay.from_base64(jsonob["id"])
            for name, field_type in get_valid_fields(type_name):
                if name in jsonob:
                    if not isinstance(jsonob[name], field_type):
                        raise ValueError(
                            "Invalid field type (%s) for: %s"
                            % (type(jsonob[name]), name)
                        )
                    if name == "flexid":
                        # autogenerate new flexid
                        newob[name] = None
                    else:
                        newob[name] = jsonob[name]
            update_mapper[type_name][idpart] = newob

        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            for _flexid, _id in only_owned_helper(
                klass,
                update_mapper[type_name].keys(),
                request=request,
                fields=(
                    ("id", "id") if type_name == "Action" else ("flexid", "id")
                ),
                authset=authset,
                admin=admin,
            ):
                if _id in _del_sets[type_name]:
                    continue
                result["update"][type_name][_id] = update_mapper[type_name][
                    _flexid
                ]
        return result
