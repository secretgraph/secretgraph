from datetime import timedelta as td

from django.db.models import Q

from ...models import Cluster, Content


class ViewHandlers:
    @staticmethod
    def do_auth(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "auth":
            return None
        action.delete()

        if issubclass(sender, Content):
            excl_filters = Q(type="PrivateKey")
            if action_dict["excludeTypes"]:
                excl_filters |= Q(type__in=action_dict["excludeTypes"])
            for i in action_dict["excludeTags"]:
                if i.startswith("id="):
                    excl_filters |= Q(flexid_cached=i[3:])
                elif i.startswith("=id="):
                    excl_filters |= Q(flexid_cached=i[4:])
                elif i.startswith("="):
                    excl_filters |= Q(tags__tag=i[1:])
                else:
                    excl_filters |= Q(tags__tag__startswith=i)

            incl_filters = Q()
            if action_dict["includeTypes"]:
                incl_filters |= Q(type__in=action_dict["includeTypes"])
            if action_dict["states"]:
                incl_filters |= Q(state__in=action_dict["states"])
            for i in action_dict["includeTags"]:
                if i.startswith("id="):
                    incl_filters |= Q(flexid_cached=i[3:])
                elif i.startswith("=id="):
                    incl_filters |= Q(flexid_cached=i[4:])
                elif i.startswith("="):
                    incl_filters |= Q(tags__tag=i[1:])
                else:
                    incl_filters |= Q(tags__tag__startswith=i)

            return {
                "filters": ~excl_filters & incl_filters,
                "accesslevel": 3,
                "trustedKeys": action_dict.get("trustedKeys", []),
            }
        elif issubclass(sender, Cluster):
            return {
                "filters": Q(),
                "accesslevel": 3,
                "trustedKeys": action_dict.get("trustedKeys", []),
            }
        return None

    @staticmethod
    def clean_auth(action_dict, request, content, authset):
        result = {
            "action": "auth",
            "contentActionGroup": "view"
            if not action_dict.get("fetch") or not content
            else "fetch",
            "maxLifetime": td(hours=1),
        }
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
            excl_filters = Q(type="PrivateKey")
            if action_dict["excludeTypes"]:
                excl_filters |= Q(type__in=action_dict["excludeTypes"])
            for i in action_dict["excludeTags"]:
                if i.startswith("id="):
                    excl_filters |= Q(flexid_cached=i[3:])
                elif i.startswith("=id="):
                    excl_filters |= Q(flexid_cached=i[4:])
                elif i.startswith("="):
                    excl_filters |= Q(tags__tag=i[1:])
                else:
                    excl_filters |= Q(tags__tag__startswith=i)

            incl_filters = Q()
            if action_dict["includeTypes"]:
                incl_filters |= Q(type__in=action_dict["includeTypes"])
            if action_dict["states"]:
                incl_filters |= Q(state__in=action_dict["states"])
            for i in action_dict["includeTags"]:
                if i.startswith("id="):
                    incl_filters |= Q(flexid_cached=i[3:])
                elif i.startswith("=id="):
                    incl_filters |= Q(flexid_cached=i[4:])
                elif i.startswith("="):
                    incl_filters |= Q(tags__tag=i[1:])
                else:
                    incl_filters |= Q(tags__tag__startswith=i)

            return {
                "filters": ~excl_filters & incl_filters,
                "accesslevel": ownaccesslevel,
                "trustedKeys": action_dict.get("trustedKeys", []),
            }
        elif issubclass(sender, Cluster):
            return {
                "filters": Q(),
                "accesslevel": ownaccesslevel,
                "trustedKeys": action_dict.get("trustedKeys", []),
            }
        return None

    @staticmethod
    def clean_view(action_dict, request, content, authset):
        result = {
            "action": "view",
            "contentActionGroup": "view"
            if not action_dict.get("fetch") or not content
            else "fetch",
        }
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
