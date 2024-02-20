import re
from itertools import chain

from ..models import Net

# TODO: may improve dataclasses so everything is calculated from itself


def check_actions(actions, result):
    passed = len(result["active_actions"]) == 0
    if not actions:
        return
    for action_id in result["active_actions"]:
        action_result = result["action_results"][action_id]
        if action_result.get("allowedActions", None) is None:
            pass
        else:
            matcher = re.compile(
                "^(%s)$" % "|".join(map(re.escape, action_result["allowedActions"]))
            )
            if actions.any(lambda x: not matcher.fullmatch(x.value.value)):
                continue
        # now mark that at least one action passed the checks
        passed = True
    if not passed:
        raise ValueError("not passed")


# clean the single parts
def pre_clean_update_content_args(tags, state, references, actions, result):
    passed = len(result["active_actions"]) == 0
    injectedTags = set()
    injectedRefs = {}

    for action_id in result["active_actions"]:
        action_result = result["action_results"][action_id]
        if not actions:
            pass
        else:
            if action_result.get("allowedActions", None) is None:
                pass
            else:
                matcher = re.compile(
                    "^(%s)$" % "|".join(map(re.escape, action_result["allowedActions"]))
                )
                if actions.any(lambda x: not matcher.fullmatch(x.value.value)):
                    continue
        if not state:
            pass
        elif action_result.get("allowedStates", None) is None:
            pass
        else:
            if state not in action_result["allowedStates"]:
                continue

        if not tags:
            pass
        else:
            if action_result.get("allowedTags", None) is None:
                pass
            else:
                matcher = re.compile(
                    "^(?:%s)(?:(?<==)|$)"
                    % "|".join(map(re.escape, action_result["allowedTags"]))
                )
                if tags.any(lambda x: not matcher.fullmatch(x)):
                    continue
        if action_result["accesslevel"] < 0:
            continue
        # now mark that at least one action passed the checks
        passed = True

        if action_result.get("injectedTags"):
            injectedTags.update(action_result["injectedTags"])
        for ref in action_result.get("injectedRefs") or []:
            key = (ref.target, ref.group or "")
            if key in injectedRefs:
                continue
            injectedRefs[key] = ref
    if not passed:
        raise ValueError("not passed")

    if injectedTags:
        if tags is not None:
            tags = chain(tags, injectedTags)
    if injectedRefs:
        if references is not None:
            references = chain(references, injectedRefs.values())
    return {
        "tags": tags,
        "references": references,
    }


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
        action_dict = result["action_results"][action_id]
        if not actions:
            pass
        else:
            if action_dict.get("allowedActions", None) is None:
                pass
            else:
                matcher = re.compile(
                    "^(%s)$" % "|".join(map(re.escape, action_dict["allowedActions"]))
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

        # only check if tags are available
        if tags:
            if action_dict.get("allowedTags", None) is None:
                pass
            else:
                matcher = re.compile(
                    "^(?:%s)(?:(?<==)|$)"
                    % "|".join(map(re.escape, action_dict["allowedTags"]))
                )
                if tags.any(lambda x: not matcher.fullmatch(x)):
                    continue
        if action_dict["accesslevel"] < 0:
            continue
        # now mark that at least one action passed the checks
        passed = True
        # now update outer parameters, e.g. updateable,...
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
            content.references = chain(content.references or [], injectedRefs.values())
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
        "injectedReferences": injectedRefs,
        "injectedTags": injectedTags,
    }
