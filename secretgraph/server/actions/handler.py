
import json
from functools import lru_cache
from django.db.models import Q
from graphql_relay import from_global_id

from ..models import Content, Component, Action


def _only_owned_helper(klass, linput, request, fields=("id",)):
    from ..utils.auth import retrieve_allowed_objects
    if hasattr(klass, "flexid"):
        return retrieve_allowed_objects(
            request, "manage", klass.objects.filter(
                flexid__in=linput or []
            )
        )["objects"].values_list(*fields, flat=True)
    else:
        fields = {"flexid"}.symmetric_difference(fields)
        return retrieve_allowed_objects(
            request, "manage",
            klass.objects.filter(id__in=linput or [])
        )["objects"].values_list(*fields, flat=True)


@lru_cache()
def get_valid_fields(klass):
    if isinstance(klass, str):
        from django.apps import apps
        klass = apps.get_model("secretgraph_base", klass)
    return {
        name: klass.__annotations__[name] for name in set(map(
            lambda x: x.name, klass._meta.get_fields()
        )).difference((
            "id", "component", "references", "referenced_by"
        )).union(klass.__annotations__.keys())
    }


class ActionHandler():
    @classmethod
    def handle_action(cls, sender, action_dict, **kwargs):
        return getattr(
            cls, "do_%s" % action_dict["action"], "default"
        )(action_dict, sender=sender, **kwargs)

    @classmethod
    def clean_action(cls, action_dict, request):
        action = action_dict["action"]
        result = getattr(
            cls, "clean_%s" % action
        )(action_dict, request)
        assert result["action"] == action
        return result

    @staticmethod
    def default(action_dict, **kwargs):
        return None

    @staticmethod
    def do_view(action_dict, scope, sender, accesslevel, **kwargs):
        if accesslevel > 1 or scope != "view":
            return None
        if isinstance(sender, Content):
            excl_filters = Q()
            for i in action_dict.get("exclude_info", []):
                excl_filters |= Q(info__tag__startswith=i)

            incl_filters = Q()
            for i in action_dict.get("include_info", []):
                incl_filters |= Q(info__tag__startswith=i)

            return {
                "filters": ~excl_filters & incl_filters
            }
        return None

    @staticmethod
    def clean_view(action_dict, request):
        result = {
            "action": "view"
        }
        exclude_info = action_dict.get("exclude_info", [])
        if not all(map(lambda x: isinstance(str), exclude_info)):
            raise ValueError()
        result["exclude_info"] = exclude_info
        include_info = action_dict.get("include_info", [])
        if not all(map(lambda x: isinstance(str), include_info)):
            raise ValueError()
        result["include_info"] = include_info
        return result

    @staticmethod
    def do_update(action_dict, scope, sender, accesslevel, **kwargs):
        if accesslevel > 1 or scope != "update":
            return None
        if isinstance(sender, Content):
            incl_filters = Q(id__in=action_dict.get("ids", []))
            return {
                "filters": incl_filters
            }
        return None

    @staticmethod
    def clean_update(action_dict, request):
        action_dict["ids"] = _only_owned_helper(
            Content, action_dict.get("ids"), request
        )
        return action_dict

    @staticmethod
    def do_extra(action_dict, scope, sender, **kwargs):
        if scope == action_dict["extra"]:
            incl_filters = Q()
            for i in action_dict.get("include_info", []):
                incl_filters |= Q(info__tag__startswith=i)

            return {
                "filters": incl_filters,
                "form": action_dict.get("form"),
                "extras": action_dict.get("extras") or []
            }
        return None

    @staticmethod
    def clean_extra(action_dict, request):
        result = {
            "action": "extra"
        }
        if action_dict.get("extra", None) not in {"push"}:
            raise ValueError()
        include_info = action_dict.get("include_info", [])
        if not all(map(lambda x: isinstance(str), include_info)):
            raise ValueError()
        result["include_info"] = include_info
        return result

    @staticmethod
    def do_manage(
        action_dict, scope, sender, action, **kwargs
    ):
        type_name = sender.__name__
        excl_filters = Q(
            id__in=action_dict["exclude"][type_name]
        )
        if (
            action_dict["type"] == "Component" and
            action_dict["type"] != type_name
        ):
            excl_filters |= Q(
                component__id__in=action_dict["exclude"]["Component"]
            )
        return {
            "filters": ~excl_filters,
            "accesslevel": 2
        }

    @staticmethod
    def clean_manage(action_dict, request):
        result = {
            "action": "manage",
            "exclude": {
                "Component": [],
                "Content": [],
                "Action": []
            }
        }
        for idtuple in action_dict.get("exclude") or []:
            type_name, id = from_global_id(idtuple)
            result["exclude"][type_name].append(id)
        for klass in [Component, Content, Action]:
            type_name = klass.__name__
            action_dict["exclude"][type_name] = _only_owned_helper(
                klass, action_dict["exclude"].get(type_name)
            )
        return result

    @staticmethod
    def do_stored_update(action_dict, scope, **kwargs):
        for klass in [Component, Content, Action]:
            type_name = klass.__name__
            klass.objects.filter(
                id__in=action_dict["delete"][type_name]
            ).delete()
            for _id, updatevalues in action_dict["update"][type_name].items():
                updatevalues.pop("id", None)
                updatevalues.pop("component", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referenced_by", None)
                klass.objects.filter(id=_id).update(**updatevalues)
        return None

    @staticmethod
    def clean_stored_update(action_dict, request):
        result = {
            "action": "stored_update",
            "delete": {
                "Component": [],
                "Content": [],
                "Action": []
            },
            "update": {
                "Component": {},
                "Content": {},
                "Action": {}
            }
        }
        update_mapper = {
            "Component": {},
            "Content": {},
            "Action": {}
        }

        for idtuple in action_dict.get("delete") or []:
            type_name, id = from_global_id(idtuple)
            result["delete"][type_name].append(id)

        for klass in [Component, Content, Action]:
            type_name = klass.__name__
            result["delete"][type_name] = _only_owned_helper(
                klass, result["delete"][type_name], request
            )

        _del_sets = {
            "Component": set(result["delete"]["Component"]),
            "Content": set(result["delete"]["Content"]),
            "Action": set(result["delete"]["Action"]),
        }

        for jsonob in action_dict.get("update") or []:
            if isinstance(jsonob, str):
                jsonob = json.loads(jsonob)
            newob = {}
            type_name, id = from_global_id(jsonob.get("id"))
            for name, field_type in get_valid_fields(type_name):
                if name in jsonob:
                    if not isinstance(jsonob[name], field_type):
                        raise ValueError(
                            "Invalid field type (%s) for: %s" % (
                                type(jsonob[name]),
                                name
                            )
                        )
                    newob[name] = jsonob[name]
            update_mapper[type_name][id] = newob

        for klass in [Component, Content]:
            type_name = klass.__name__
            for _flexid, _id in _only_owned_helper(
                klass, update_mapper[type_name].keys(), request,
                fields=("flexid", "id")
            ):
                if _id in _del_sets[type_name]:
                    continue
                result["update"][type_name][_id] = \
                    update_mapper[type_name][_flexid]

        for _id in _only_owned_helper(
            Action, update_mapper["Action"].keys(), request
        ):
            if _id in _del_sets[type_name]:
                continue
            result["update"]["Action"][_id] = \
                update_mapper["Action"][_flexid]
        return result
