
from uuid import UUID
from functools import lru_cache
from django.db.models import Q

from .models import Content, Component, Action


def _only_owned_helper(klass, linput, info, fields=("id",)):
    from .utils import retrieve_allowed_objects
    if hasattr(klass, "flexid"):
        return retrieve_allowed_objects(
            info, "manage", klass.objects.filter(
                flexid__in=linput or []
            )
        )["objects"].values_list(*fields, flat=True)
    else:
        return retrieve_allowed_objects(
            info, "manage",
            klass.objects.filter(id__in=linput or [])
        )["objects"].values_list(*fields, flat=True)


@lru_cache()
def get_valid_fields(klass):
    return frozenset(
        set(map(lambda x: x.name, klass._meta.get_fields())).difference((
            "id", "component", "references", "referenced_by"
        ))
    )


class ActionHandler():
    @classmethod
    def handle_action(cls, sender, action_dict, **kwargs):
        return getattr(
            cls, "do_%s" % action_dict["action"], "default"
        )(action_dict, sender=sender, **kwargs)

    @classmethod
    def clean_action(cls, action_dict, info):
        return getattr(
            cls, "clean_%s" % action_dict["action"]
        )(action_dict)

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
    def clean_view(action_dict, info):
        exclude_info = action_dict.get("exclude_info", [])
        if not all(map(lambda x: isinstance(str), exclude_info)):
            raise ValueError()
        action_dict["exclude_info"] = exclude_info
        include_info = action_dict.get("include_info", [])
        if not all(map(lambda x: isinstance(str), include_info)):
            raise ValueError()
        action_dict["include_info"] = include_info
        return action_dict

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
    def clean_update(action_dict, info):
        action_dict["ids"] = _only_owned_helper(
            Content, action_dict.get("ids")
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
                "form": action_dict.get("form")
            }
        return None

    @staticmethod
    def clean_extra(action_dict, info):
        if action_dict.get("extra", None) not in {"push"}:
            raise ValueError()
        include_info = action_dict.get("include_info", [])
        if not all(map(lambda x: isinstance(str), include_info)):
            raise ValueError()
        action_dict["include_info"] = include_info
        return action_dict

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
                component__flexid__in=action_dict["exclude"]["Component"]
            )
        return {
            "filters": ~excl_filters,
            "accesslevel": 2
        }

    @staticmethod
    def clean_manage(action_dict, info):
        action_dict.setdefault("exclude", {})
        for n in ["Content", "Component", "Action"]:
            action_dict["exclude"].setdefault(n, [])
            try:
                all(map(UUID, action_dict["exclude"][n]))
            except Exception:
                raise ValueError()
        return action_dict

    @staticmethod
    def do_stored_update(action_dict, scope, **kwargs):
        for obj in [Component, Content, Action]:
            type_name = obj.__name__
            obj.objects.filter(
                id__in=action_dict["delete"][type_name]
            ).delete()
            for _id, updatevalues in action_dict["update"][type_name].items():
                updatevalues.pop("id", None)
                updatevalues.pop("component", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referenced_by", None)
                obj.objects.filter(id=_id).update(**updatevalues)
        return None

    @staticmethod
    def clean_stored_update(action_dict, info):
        # verify that permission for component is exists
        action_dict.setdefault("delete", {})
        action_dict.setdefault("update", {})
        for klass in [Component, Content, Action]:
            n = klass.__name__
            action_dict["delete"][n] = _only_owned_helper(
                n, action_dict["delete"].get(n), info
            )
            updates = {}
            for _flexid, _id in _only_owned_helper(
                n, action_dict["update"].get(n, {}).keys(), info,
                fields=("flexid", "ids")
            ):
                if _id in action_dict["delete"][n]:
                    continue
                if not get_valid_fields(klass).issubset(
                    action_dict["update"][n][_flexid]
                ):
                    raise ValueError("Invalid fields")
                updates[_id] = action_dict["update"][n][_flexid]
            action_dict["update"][n] = updates
        return action_dict
