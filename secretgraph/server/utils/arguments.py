import re
from itertools import chain


def pre_clean_content_spec(create, content, result):
    updateable = False
    freeze = False
    injectedTags = set()
    injectedRefs = {}
    passed = False
    if content.get("value"):
        tags = content["value"].get("tags") or []
        state = content["value"].get("state")
        ctype = content["value"].get("type")
    else:
        tags = content["key"].get("privateTags") or []
        tags.extend(content["key"].get("publicTags") or [])
        state = content["key"].get("publicState")
        ctype = "PublicKey"
    actions = content.get("actions")
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
            key = (ref["target"], ref.get("group") or "")
            if key in injectedRefs:
                continue
            injectedRefs[key] = ref
    if not passed:
        raise ValueError("not passed")

    if injectedTags:
        if content.get("value"):
            if content["value"].get("tags") is not None or create:
                content["value"]["tags"] = chain(tags, injectedTags)
        else:
            if content["key"].get("privateTags") is not None or create:
                content["key"]["privateTags"] = chain(
                    content["key"].get("privateTags") or [], injectedTags
                )
            if content["key"].get("publicTags") is not None or create:
                content["key"]["publicTags"] = chain(
                    content["key"].get("publicTags") or [], injectedTags
                )

    if injectedRefs:
        if content.get("references") is not None or create:
            content["references"] = chain(
                content.get("references") or [], injectedRefs.values()
            )
    return {
        "freeze": freeze,
        "updateable": updateable,
    }
