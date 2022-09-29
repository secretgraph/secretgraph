import re
from itertools import chain

from ..models import Net


def pre_clean_content_spec(create: bool, content, result):
    updateable = False
    freeze = False
    # must be ordered
    additionalNets = {}
    injectedTags = set()
    injectedRefs = {}
    passed = len(result["active_actions"]) == 0
    if content.value:
        tags = content.value.tags or []
        state = content.value.state
        ctype = content.value.type
        actions = content.value.actions
    else:
        tags = content.key.privateTags or []
        tags.extend(content.key.publicTags or [])
        state = content.key.publicState
        ctype = "PublicKey"
        actions = content.key.publicActions
        if content.key.privateActions:
            actions = actions or []
            actions.extend(content.key.privateActions)

    if create and not ctype:
        raise ValueError("no type found")
    for action_id in result["active_actions"]:
        action_dict = result["decrypted"][action_id]
        if not actions:
            pass
        else:
            if action_dict.get("allowedActions", None) is None:
                pass
            else:
                matcher = re.compile(
                    "^(%s)$"
                    % "|".join(map(re.escape, action_dict["allowedActions"]))
                )
                if actions.any(lambda x: not matcher.fullmatch(x.value.value)):
                    continue
        if not create:
            pass
        elif action_dict.get("allowedTypes", None) is None:
            pass
        else:
            if ctype not in action_dict["allowedTypes"]:
                continue
        if not state:
            pass
        elif action_dict.get("allowedStates", None) is None:
            pass
        else:
            if state not in action_dict["allowedStates"]:
                continue
        _nets = action_dict.get("nets") or []
        for _net in _nets:
            if isinstance(_net, Net):
                additionalNets[_net.id] = True
            elif _net not in additionalNets:
                additionalNets[_net] = True

        if not tags:
            if not create:
                pass
            else:
                continue
        else:
            if action_dict.get("allowedTags", None) is None:
                pass
            else:
                matcher = re.compile(
                    "^(?:%s)(?:(?<==)|$)"
                    % "|".join(map(re.escape, action_dict["allowedTags"]))
                )
                if tags.any(lambda x: not matcher.fullmatch(x)):
                    continue
        if not action_dict["accesslevel"] < 0:
            passed = True
        if action_dict.get("updateable"):
            updateable = True
        if action_dict.get("freeze"):
            freeze = True

        if action_dict.get("injectedTags"):
            injectedTags.update(action_dict["injectedTags"])
        for ref in action_dict.get("injectedRefs") or []:
            key = (ref.target, ref.group or "")
            if key in injectedRefs:
                continue
            injectedRefs[key] = ref
    if not passed:
        raise ValueError("not passed")

    if injectedTags:
        if content.value:
            if content.value.tags is not None or create:
                content.value.tags = chain(tags, injectedTags)
        else:
            if content.key.privateTags is not None or create:
                content.key.privateTags = chain(
                    content.key.privateTags or [], injectedTags
                )
            if content.key.publicTags is not None or create:
                content.key.publicTags = chain(
                    content.key.publicTags or [], injectedTags
                )

    if injectedRefs:
        if content.references is not None or create:
            content.references = chain(
                content.references or [], injectedRefs.values()
            )
    additionalNets = list(additionalNets.keys())
    if create and not content.net:
        # we identify the net directly by the net id if set by action
        # this bypasses the ownership check
        if additionalNets:
            content.net = Net.objects.get(id=additionalNets[0])
    content.additionalNets = additionalNets
    return {
        "freeze": freeze,
        "updateable": updateable,
    }
