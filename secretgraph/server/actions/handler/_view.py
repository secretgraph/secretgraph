from datetime import timedelta as td

from django.db.models import Q

from ...models import Cluster, Content


class ViewHandlers:
    @staticmethod
    def do_auth(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "view":
            return None
        # for beeing able to rollback when an error happens
        if action.used:
            action.delete()
            return None

        if issubclass(sender, Content):
            excl_filters_type = Q(type="PrivateKey")
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

            return {
                "filters": ~excl_filters_type
                & ~excl_filters_tag
                & incl_filters_state
                & incl_filters_tag
                & incl_filters_type,
                "accesslevel": 3,
            }
        elif issubclass(sender, Cluster):
            return {
                "filters": Q(),
                "accesslevel": 3,
            }
        return None

    @staticmethod
    def clean_auth(action_dict, request, content, authset, admin):
        result = {
            "action": "auth",
            "contentActionGroup": "view",
            "maxLifetime": td(hours=1),
        }
        if action_dict.get("includeTypes") and action_dict.get("excludeTypes"):
            raise ValueError(
                "Either includeTypes or excludeTypes should be specified"
            )
        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
            result["states"] = []
            result["includeTypes"] = []
            result["excludeTypes"] = []
        else:
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

    @staticmethod
    def do_view(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "view":
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

            return {
                "filters": ~excl_filters_type
                & ~excl_filters_tag
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

    @staticmethod
    def clean_view(action_dict, request, content, authset, admin):
        result = {
            "action": "view",
            "contentActionGroup": "view"
            if not action_dict.get("fetch") or not content
            else "fetch",
        }
        if action_dict.get("includeTypes") and action_dict.get("excludeTypes"):
            raise ValueError(
                "Either includeTypes or excludeTypes should be specified"
            )
        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
            result["states"] = []
            result["includeTypes"] = []
            result["excludeTypes"] = []
        else:
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
