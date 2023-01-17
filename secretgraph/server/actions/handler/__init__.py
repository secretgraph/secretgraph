from ._shared import get_valid_fields  # noqa: F401
from ._sideeffects import SideEffectsHandlers
from ._update import UpdateHandlers
from ._view import ViewHandlers


class ActionHandler(SideEffectsHandlers, UpdateHandlers, ViewHandlers):
    @classmethod
    def handle_action(cls, sender, action_dict, /, **kwargs):
        return getattr(cls, "do_%s" % action_dict["action"], "default")(
            action_dict, sender=sender, **kwargs
        )

    @classmethod
    def clean_action(cls, action_dict, /, request, content=None, admin=False):
        action = action_dict["action"]
        result = getattr(cls, "clean_%s" % action)(
            action_dict, request, content=content, admin=admin
        )
        assert result["action"] == action
        return result

    @staticmethod
    def default(action_dict, **kwargs):
        return None
