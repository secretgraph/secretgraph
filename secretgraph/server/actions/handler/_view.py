from datetime import timedelta as td

from django.db.models import Q

from ...models import Cluster, Content
from ._shared import get_forbidden_content_ids


class ViewHandlers:
    @staticmethod
    def do_auth(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "auth":
            return None
        # for beeing able to rollback when an error happens
        if action.used:
            action.delete()
            return None

        if issubclass(sender, Content):
            excl_filters = Q()

            if action_dict.get("excludeIds"):
                excl_filters |= Q(id__in=action_dict["excludeIds"])
            return {
                "filters": ~excl_filters,
                "accesslevel": 3,
            }
        elif issubclass(sender, Cluster):
            return {
                "filters": Q(),
                "accesslevel": 3,
            }
        return None

    @classmethod
    def clean_auth(cls, action_dict, request, content, admin):
        result = {
            "action": "auth",
            "excludeIds": []
            if content
            else list(get_forbidden_content_ids(request)),
            "maxLifetime": td(hours=1),
        }
        return result

    @staticmethod
    def do_view(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope not in {"view", "link"}:
            if scope != "peek" or not action_dict.get("allowPeek"):
                return None
        ownaccesslevel = 1
        if accesslevel > ownaccesslevel:
            return None

        if issubclass(sender, Content):
            excl_filters_type = Q()
            if action_dict["excludeTypes"]:
                excl_filters_type |= Q(type__in=action_dict["excludeTypes"])
            excl_filters_tag = Q()
            for i in action_dict["excludeTags"]:
                if i.startswith("id="):
                    excl_filters_tag |= Q(flexid_cached=i[3:])
                elif i.startswith("=id="):
                    excl_filters_tag |= Q(flexid_cached=i[4:])
                elif i.startswith("="):
                    excl_filters_tag |= Q(tags__tag=i[1:])
                else:
                    excl_filters_tag |= Q(tags__tag__startswith=i)

            incl_filters_type = Q()
            if action_dict["includeTypes"]:
                incl_filters_type |= Q(type__in=action_dict["includeTypes"])
            incl_filters_state = Q()
            if action_dict["states"]:
                incl_filters_state |= Q(state__in=action_dict["states"])

            incl_filters_tag = Q()
            for i in action_dict["includeTags"]:
                if i.startswith("id="):
                    incl_filters_tag |= Q(flexid_cached=i[3:])
                elif i.startswith("=id="):
                    incl_filters_tag |= Q(flexid_cached=i[4:])
                elif i.startswith("="):
                    incl_filters_tag |= Q(tags__tag=i[1:])
                else:
                    incl_filters_tag |= Q(tags__tag__startswith=i)
            excl_filters = excl_filters_type | excl_filters_tag
            if action_dict.get("excludeIds"):
                excl_filters |= Q(id__in=action_dict["excludeIds"])

            return {
                "filters": ~excl_filters
                & incl_filters_state
                & incl_filters_tag
                & incl_filters_type,
                "accesslevel": ownaccesslevel,
            }
        elif issubclass(sender, Cluster):
            return {
                "filters": Q(),
                "accesslevel": ownaccesslevel,
            }
        return None

    @classmethod
    def clean_view(cls, action_dict, request, content, admin):
        result = {
            "action": "view",
            "contentActionGroup": "view",
            "allowPeek": True
            if action_dict.get("allowPeek", False)
            else False,
        }
        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
            result["states"] = []
            result["includeTypes"] = []
            result["excludeTypes"] = []
            result["excludeIds"] = []
            if action_dict.get("fetch"):
                result["contentActionGroup"] = "fetch"
        else:
            if action_dict.get("includeTypes") and action_dict.get(
                "excludeTypes"
            ):
                raise ValueError(
                    "Only one of includeTypes or "
                    "excludeTypes should be specified"
                )
            result["excludeIds"] = list(get_forbidden_content_ids(request))
            exclude_tags = action_dict.get("excludeTags", [])
            result["excludeTags"] = list(map(str, exclude_tags))
            include_tags = action_dict.get("includeTags", [])
            result["includeTags"] = list(map(str, include_tags))
            states = action_dict.get("states", [])
            result["states"] = list(map(str, states))
            exclude_types = action_dict.get("excludeTypes", [])
            result["excludeTypes"] = list(map(str, exclude_types))
            include_types = action_dict.get("includeTypes", [])
            result["includeTypes"] = list(map(str, include_types))
        return result
