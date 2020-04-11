
import json
from functools import lru_cache
from django.db.models import Q
from graphql_relay import from_global_id

from ..models import Content, Component, Action


def _only_owned_helper(
    klass, linput, request, fields=("id",), check_field=None
):
    from ..utils.auth import retrieve_allowed_objects
    if not check_field:
        check_field = "flexid"
    if check_field == "flexid" and not hasattr(klass, "flexid"):
        check_field = "id"
    if not hasattr(klass, "flexid"):
        fields = set(fields).difference({"flexid"})
    return retrieve_allowed_objects(
        request, "manage",
        klass.objects.filter(**{f"{check_field}__in": linput or []})
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
        if issubclass(sender, Content):
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
        if issubclass(sender, Content):
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
        if type_name != "Component":
            excl_filters |= Q(
                component__id__in=action_dict["exclude"]["Component"]
            )
        if type_name == "Action":
            excl_filters |= Q(
                content_action__content_id__in=action_dict[
                    "exclude"
                ]["Content"]
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
                "Content": []
            }
        }
        for idtuple in action_dict.get("exclude") or []:
            type_name, id = from_global_id(idtuple)
            result["exclude"][type_name].append(id)
        result["exclude"]["Action"] = set()
        for key_hash in action_dict.get("exclude_actions") or []:
            result["exclude"]["Action"].append(key_hash)
        for klass in [Component, Content]:
            type_name = klass.__name__
            result["exclude"][type_name] = _only_owned_helper(
                klass, result["exclude"][type_name], request
            )
        result["exclude"]["Action"] = _only_owned_helper(
            klass, action_dict["exclude"]["Action"], request
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
                "Content": []
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
        }

        for idtuple in action_dict.get("delete") or []:
            type_name, id = from_global_id(idtuple)
            result["delete"][type_name].append(id)

        result["delete"]["Action"] = []
        for keyhash in action_dict.get("delete_actions") or []:
            result["delete"][type_name].append(keyhash)

        for klass in [Component, Content, Action]:
            type_name = klass.__name__
            result["delete"][type_name] = _only_owned_helper(
                klass, result["delete"][type_name], request,
                check_field="key_hash" if type_name == "Action" else None
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
            idpart = jsonob.get("id")
            if idpart:
                type_name, id = from_global_id(idpart)
            else:
                type_name = "Action"
                id = jsonob["key_hash"]
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

        for _key_hash, _content_action, _id in _only_owned_helper(
            Action, update_mapper["Action"].keys(), request,
            fields=("key_hash", "content_action", "id"),
            check_field="key_hash"
        ):
            if _id in _del_sets[type_name]:
                continue
            content = update_mapper["Action"][_key_hash].get("content", None)
            if content and (
                not _content_action or
                _content_action.content_id != content
            ):
                continue
            elif not content and _content_action:
                continue
            result["update"]["Action"][_id] = \
                dict(filter(
                    lambda x, y: x != "content",
                    update_mapper["Action"][_key_hash].items()
                ))
        return result
