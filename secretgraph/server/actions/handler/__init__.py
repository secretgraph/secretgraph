from ._sideeffects import SideEffectsHandlers
from ._update import UpdateHandlers
from ._view import ViewHandlers


class ActionHandler(SideEffectsHandlers, UpdateHandlers, ViewHandlers):
    @classmethod
    async def handle_action(cls, sender, action_dict, /, **kwargs):
        result = await getattr(cls, "do_%s" % action_dict["action"], "default")(
            action_dict, sender=sender, **kwargs
        )
        # force include the original input when returning a dict and not False or None
        if isinstance(result, dict):
            result["value"] = action_dict
        return result

    @classmethod
    async def clean_action(
        cls, action_dict, /, request, cluster, content=None, admin=False
    ):
        action = action_dict["action"]
        result = await getattr(cls, "clean_%s" % action)(
            action_dict,
            request=request,
            cluster=cluster,
            content=content,
            admin=admin,
        )
        assert result and result["action"] == action
        return result

    @staticmethod
    def default(action_dict, **kwargs):
        return None
