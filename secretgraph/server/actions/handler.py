
import json
from functools import lru_cache
from django.db.models import Q
from graphql_relay import from_global_id

from ..models import Content, Cluster, Action


def _only_owned_helper(
    klass, linput, request, fields=("id",), check_field=None, scope="manage"
):
    from ..utils.auth import retrieve_allowed_objects
    if not check_field:
        check_field = "flexid"
    if check_field == "flexid" and not hasattr(klass, "flexid"):
        check_field = "id"
    if not hasattr(klass, "flexid"):
        fields = set(fields).difference({"flexid"})
    return retrieve_allowed_objects(
        request, scope,
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
            "id", "cluster", "cluster_id", "references", "referenced_by"
        )).union(klass.__annotations__.keys())
    }


class ActionHandler():
    @classmethod
    def handle_action(cls, sender, action_dict, **kwargs):
        return getattr(
            cls, "do_%s" % action_dict["action"], "default"
        )(action_dict, sender=sender, **kwargs)

    @classmethod
    def clean_action(cls, action_dict, request, content=None):
        action = action_dict["action"]
        result = getattr(
            cls, "clean_%s" % action
        )(action_dict, request, content)
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
                "filters": ~excl_filters & incl_filters,
                "accesslevel": 1
            }
        return None

    @staticmethod
    def clean_view(action_dict, request, content):
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
        if action_dict.get("restricted") and scope == "update":
            ownaccesslevel = 3
        else:
            ownaccesslevel = 0
        if accesslevel > ownaccesslevel or scope not in {"update", "view"}:
            return None
        if issubclass(sender, Content):
            incl_filters = Q(id__in=action_dict.get("ids", []))
            return {
                "filters": incl_filters,
                "form": action_dict["form"],
                "accesslevel": ownaccesslevel
            }
        elif issubclass(sender, Cluster):
            incl_filters = Q(content__id__in=action_dict.get("ids", []))
            return {
                "filters": incl_filters,
                "form": action_dict["form"],
                "accesslevel": ownaccesslevel
            }
        return None

    @staticmethod
    def clean_update(action_dict, request, content):
        result = {
            "action": "update",
            "content_action_group": "update",
            "restricted": bool(action_dict.get("restricted")),
            "ids": _only_owned_helper(
                Content,
                action_dict.get("ids", content and [content.id]),
                request
            ),
            "form": {
                "required_keys": [],
                "info": [],
                "references": []
            }
        }

        if action_dict.get("required_keys"):
            result["form"]["required_keys"] = list(_only_owned_helper(
                Content, action_dict["required_keys"], request,
                fields=("id",), check_field="content_hash", scope="view"
            ))
        if action_dict.get("info"):
            for i in action_dict["info"]:
                if i in {"public_key", "private_key"}:
                    raise ValueError()
            result["form"]["info"].extend(action_dict.get("info", []))
        return result

    @staticmethod
    def do_push(action_dict, scope, sender, accesslevel, **kwargs):
        if scope == "push" and issubclass(sender, Content):
            return {
                "filters": Q(id=action_dict["id"]),
                "form": action_dict["form"],
                "accesslevel": 3
            }
        if accesslevel < 1 and scope == "view" and issubclass(sender, Content):
            return {
                "filters": (
                    Q(id=action_dict["id"]) |
                    Q(content_hash__in=action_dict["form"]["required_keys"])
                ),
                "accesslevel": 0
            }
        return None

    @staticmethod
    def clean_push(action_dict, request, content):
        if not content:
            raise ValueError("Can only be specified for a content")

        result = {
            "action": "push",
            "content_action_group": "push",
            "id": content.id,
            "form": {
                "required_keys": [],
                "info": [],
                # create update action
                "updateable": bool(action_dict.get("updateable")),
                "references": [
                    {
                        "group": "push",
                        "target": content.id,
                        "delete_recursive": True
                    }
                ]
            }
        }
        for i in action_dict.get("info", []):
            if i in {"public_key", "private_key"}:
                raise ValueError()
        result["form"]["info"].extend(action_dict.get("info", []))
        references = action_dict.get("references") or {}
        if isinstance(references, list):
            references = dict(map(lambda x: (x["target"], x), references))
        for _flexid, _id in _only_owned_helper(
            Content, references.keys(), request,
            fields=("flexid",)
        ):
            result["form"]["references"].append({
                "target": _id,
                "group": references[_flexid].get("group", ""),
                "delete_recursive": references[_flexid].get(
                    "delete_recursive", True
                )
            })
        if action_dict.get("required_keys"):
            result["form"]["required_keys"] = list(_only_owned_helper(
                Content, action_dict["required_keys"], request,
                fields=("id",), check_field="content_hash", scope="view"
            ))

        return result

    @staticmethod
    def do_manage(
        action_dict, scope, sender, action, **kwargs
    ):
        type_name = sender.__name__
        excl_filters = Q(
            id__in=action_dict["exclude"][type_name]
        )
        if type_name != "Cluster":
            excl_filters |= Q(
                cluster_id__in=action_dict["exclude"]["Cluster"]
            )
        if type_name == "Action":
            excl_filters |= Q(
                content_action__content_id__in=action_dict[
                    "exclude"
                ]["Content"]
            )
        return {
            "filters": ~excl_filters,
            "accesslevel": 2,
            "form": {
                "required_keys": [],
                "info": [],
                "references": []
            }
        }

    @staticmethod
    def clean_manage(action_dict, request, content):
        if content:
            raise ValueError("manage cannot be changed to content")
        result = {
            "action": "manage",
            "exclude": {
                "Cluster": [],
                "Content": [],
                "Action": []
            }
        }
        for idtuple in action_dict.get("exclude") or []:
            type_name, id = from_global_id(idtuple)
            result["exclude"][type_name].append(id)
        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            result["exclude"][type_name] = _only_owned_helper(
                klass, result["exclude"][type_name], request
            )
        return result

    @staticmethod
    def do_stored_update(action_dict, scope, **kwargs):
        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            klass.objects.filter(
                id__in=action_dict["delete"][type_name]
            ).delete()
            for _id, updatevalues in action_dict["update"][type_name].items():
                updatevalues.pop("id", None)
                updatevalues.pop("cluster", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referenced_by", None)
                klass.objects.filter(id=_id).update(**updatevalues)
        return None

    @staticmethod
    def clean_stored_update(action_dict, request, content):
        result = {
            "action": "stored_update",
            "delete": {
                "Cluster": [],
                "Content": [],
                "Action": []
            },
            "update": {
                "Cluster": {},
                "Content": {},
                "Action": {}
            }
        }
        update_mapper = {
            "Cluster": {},
            "Content": {},
            "Action": {}
        }

        for idtuple in action_dict.get("delete") or []:
            if ":" in idtuple:
                type_name, id = from_global_id(idtuple)
                if type_name not in {"Content", "Cluster"}:
                    raise ValueError("Invalid idtype")
                result["delete"][type_name].append(id)
            else:
                result["delete"][type_name].append(idtuple)

        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            result["delete"][type_name] = _only_owned_helper(
                klass, result["delete"][type_name], request,
                check_field="key_hash" if type_name == "Action" else None
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
            type_name, idpart = from_global_id(jsonob["id"])
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
            update_mapper[type_name][idpart] = newob

        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            for _flexid, _id in _only_owned_helper(
                klass, update_mapper[type_name].keys(), request,
                fields=(
                    ("id", "id") if type_name == "Action" else ("flexid", "id")
                )
            ):
                if _id in _del_sets[type_name]:
                    continue
                result["update"][type_name][_id] = \
                    update_mapper[type_name][_flexid]
        return result
