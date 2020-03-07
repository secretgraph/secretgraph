
from uuid import UUID
from django.db.models import Q

from .models import Content, Component, Action


class ActionHandler():
    @classmethod
    def handle_action(cls, sender, action_dict, **kwargs):
        return getattr(
            cls, "do_%s" % action_dict["action"], "default"
        )(action_dict, sender=sender, **kwargs)

    @classmethod
    def clean_action(cls, action_dict):
        return getattr(
            cls, "clean_%s" % action_dict["action"]
        )(action_dict)

    @staticmethod
    def default(action_dict, **kwargs):
        return None

    @staticmethod
    def do_view(action_dict, scope, sender, fullaccess, **kwargs):
        if scope == "view" and not fullaccess:
            excl_filters = (
                Q(flexid__in=action_dict["excluded_ids"]) |
                Q(values__name__in=action_dict["exclude_with_name"])
            )

            return {
                "excl_filters": excl_filters,
                "excl_values": Q(name__in=action_dict["hidden_values"]),
            }
        return None

    @staticmethod
    def clean_view(action_dict):
        exclude_ids = action_dict.get("exclude_ids", [])
        try:
            all(map(UUID, exclude_ids))
        except Exception:
            raise ValueError()
        exclude_with_name = action_dict.get("exclude_with_name", [])
        if not all(map(lambda x: isinstance(str), exclude_with_name)):
            raise ValueError()
        action_dict["exclude_with_name"] = exclude_with_name
        hidden_values = action_dict.get("hidden_values", [])
        if not all(map(lambda x: isinstance(str), hidden_values)):
            raise ValueError()
        action_dict["hidden_values"] = hidden_values

    @staticmethod
    def do_update(action_dict,  scope, sender, fullaccess, **kwargs):
        # broken
        excl_filters = Q()
        if scope in {"view", "update"} and not fullaccess:
            excl_filters &= ~Q(id__in=action_dict["update_ids"])
        if scope == "view" and sender in {Content, Component}:
            return {
                "excl_filters": excl_filters,
                "excl_values": ~Q(name__in=action_dict["update_values"]),
            }
        elif scope == "update" and sender in {Content, Component}:
            return {
                "excl_filters": excl_filters,
                "excl_values": ~Q(name__in=action_dict["update_values"]),
            }
        return None

    @staticmethod
    def clean_update(action_dict):
        update_ids = action_dict.get("update_ids", [])
        try:
            all(map(UUID, update_ids))
        except Exception:
            raise ValueError()
        action_dict["update_ids"] = update_ids
        update_values = action_dict.get("update_values", [])
        if not all(map(lambda x: isinstance(x, str), update_values)):
            raise ValueError()
        action_dict["update_values"] = update_values

    @staticmethod
    def do_manage(
        action_dict, scope, sender, action, fullaccess, **kwargs
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
            "excl_filters": excl_filters,
            "fullaccess": True
        }

    @staticmethod
    def clean_manage(action_dict):
        action_dict.setdefault("exclude", {})
        for n in ["Content", "Component", "Action"]:
            action_dict["exclude"].setdefault(n, [])
            try:
                all(map(UUID, action_dict["exclude"][n]))
            except Exception:
                raise ValueError()

    @staticmethod
    def do_stored_update(action_dict, scope, **kwargs):
        for obj in [Component, Content, Action]:
            type_name = obj.__name__
            obj.objects.filter(
                flexid__in=action_dict["delete"][type_name]
            ).delete()
            for obid, updatevalues in action_dict["update"][type_name].items():
                updatevalues.pop("id", None)
                updatevalues.pop("component", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referenced_by", None)
                obj.objects.filter(flexid=obid).update(**updatevalues)
        return None

    @staticmethod
    def clean_stored_update(action_dict):
        action_dict.setdefault("delete", {})
        action_dict.setdefault("update", {})
        for n in ["Component", "Content", "Action"]:
            action_dict["delete"].setdefault(n, [])
            action_dict["update"].setdefault(n, dict)
            try:
                all(map(UUID, action_dict["delete"][n]))
            except Exception:
                raise ValueError()
            if not isinstance(action_dict["update"][n], dict):
                raise ValueError()

            try:
                all(map(UUID, action_dict["update"][n].keys()))
            except Exception:
                raise ValueError()
            for idkey in action_dict["delete"][n]:
                action_dict["update"][n].pop(idkey, None)
            for updatevalues in action_dict["update"][n].values():
                updatevalues.pop("id", None)
                updatevalues.pop("component", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referenced_by", None)

    @staticmethod
    def do_push(action_dict, objects, fullaccess, scope, **kwargs):
        if scope == "push" and not fullaccess:
            return {
                "excl_filters": ~Q(flexid__in=action_dict["push_ids"]),
                "excl_values": ~Q(name__in=action_dict["push_values"])
            }
        return None

    @staticmethod
    def clean_push(action_dict):
        push_ids = action_dict.get("push_ids", [])
        try:
            all(map(UUID, push_ids))
        except Exception:
            raise ValueError()
        action_dict["push_ids"] = push_ids
        push_values = action_dict.get("push_values", [])
        if not all(map(lambda x: isinstance(str), push_values)):
            raise ValueError()
        action_dict["push_values"] = push_values
