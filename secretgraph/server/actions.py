
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
    def do_view(action_dict, objects, scope, sender, fullaccess, **kwargs):
        if scope == "view" and not fullaccess:
            objects = objects.exclude(id__in=action_dict["excluded_ids"])
            objects = objects.exclude(
                values__name__in=action_dict["exclude_with_name"]
            )
            return {
                "objects": objects,
                "hidden_values": action_dict["hidden_values"],
            }
        return None

    @staticmethod
    def clean_view(action_dict):
        exclude_ids = action_dict.get("exclude_ids", [])
        action_dict["exclude_ids"] = list(map(int, exclude_ids))
        exclude_with_name = action_dict.get("exclude_with_name", [])
        if not all(map(lambda x: isinstance(str), exclude_with_name)):
            raise ValueError()
        action_dict["exclude_with_name"] = exclude_with_name
        hidden_values = action_dict.get("hidden_values", [])
        if not all(map(lambda x: isinstance(str), hidden_values)):
            raise ValueError()
        action_dict["hidden_values"] = hidden_values

    @staticmethod
    def do_update(action_dict, objects, scope, sender, fullaccess, **kwargs):
        if scope in {"view", "update"} and not fullaccess:
            objects = objects.filter(id__in=action_dict["update_ids"])
        if scope == "view" and sender in {Content, Component}:
            return {
                "objects": objects,
                "shown_values": action_dict["shown_values"],
            }
        elif scope == "update" and sender in {Content, Component}:
            return {
                "objects": objects,
                "shown_values": action_dict["shown_values"],
            }
        return None

    @staticmethod
    def clean_update(action_dict):
        update_ids = action_dict.get("update_ids", [])
        action_dict["update_ids"] = list(map(int, update_ids))
        shown_values = action_dict.get("shown_values", [])
        if not all(map(lambda x: isinstance(str), shown_values)):
            raise ValueError()
        action_dict["shown_values"] = shown_values

    @staticmethod
    def do_manage(
        action_dict, objects, scope, sender, action, fullaccess, **kwargs
    ):
        type_name = sender.__name__
        if not fullaccess:
            objects = sender.objects.filter(component_id=action.component_id)
        objects = objects.exclude(
            id__in=action_dict["exclude"][type_name]
        )
        if (
            action_dict["type"] == "Component" and
            action_dict["type"] != type_name
        ):
            objects = objects.exclude(
                component_id__in=action_dict["exclude"]["Component"]
            )
        return {
            "objects": objects,
            "fullaccess": True
        }

    @staticmethod
    def clean_manage(action_dict):
        action_dict.setdefault("exclude", {})
        for n in ["Content", "Component", "Action"]:
            action_dict["exclude"][n].setdefault([])
            action_dict["exclude"][n] = list(map(
                int, action_dict["exclude"][n]
            ))

    @staticmethod
    def do_stored_update(action_dict, objects, scope, sender, **kwargs):
        for obj in [Component, Content, Action]:
            type_name = sender.__name__
            obj.objects.filter(
                id__in=action_dict["delete"][type_name]
            ).delete()
            for obid, updatevalues in action_dict["update"][type_name].items():
                updatevalues.pop("id", None)
                updatevalues.pop("component", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referenced_by", None)
                obj.objects.filter(id=obid).update(**updatevalues)
        return None

    @staticmethod
    def clean_stored_update(action_dict):
        action_dict.setdefault("delete", {})
        action_dict.setdefault("update", {})
        for n in ["Component", "Content", "Action"]:
            action_dict["delete"][n].setdefault([])
            action_dict["update"][n].setdefault(dict)
            action_dict["delete"][n] = list(set(map(
                int, action_dict["delete"][n]
            )))
            if action_dict["update"][n] is None:
                action_dict["update"][n] = {}
            elif not isinstance(action_dict["update"][n], dict):
                raise ValueError()
            if not all(lambda x: isinstance(x, int), action_dict["update"][n]):
                raise ValueError()
            for idkey in action_dict["delete"][n]:
                action_dict["update"][n].pop(idkey, None)
            for updatevalues in action_dict["update"][n].values():
                updatevalues.pop("id", None)
                updatevalues.pop("component", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referenced_by", None)

    @staticmethod
    def clean_push(action_dict):
        pass
