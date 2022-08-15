from django.db.models import Q, Subquery
from strawberry_django_plus import relay

from .... import constants
from ...models import Action, Cluster, Content, Net
from ._shared import only_owned_helper


class UpdateHandlers:
    @staticmethod
    def do_delete(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "delete":
            return None
        ownaccesslevel = 3
        if accesslevel > ownaccesslevel:
            return None

        if issubclass(sender, Content):
            excl_filters = Q()
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
            }
        elif issubclass(sender, Cluster) and not action.contentAction:
            return {
                "filters": Q(),
                "accesslevel": ownaccesslevel,
                "trustedKeys": action_dict.get("trustedKeys", []),
            }
        return None

    @staticmethod
    def clean_delete(action_dict, request, content, authset, admin):
        result = {"action": "delete", "contentActionGroup": "delete"}
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
    def do_update(action_dict, scope, sender, accesslevel, **kwargs):
        if action_dict.get("restricted") and scope == "update":
            ownaccesslevel = 3
        elif scope == "update":
            ownaccesslevel = 1
        else:
            ownaccesslevel = 0
        if accesslevel > ownaccesslevel or scope not in {
            "update",
            "view",
        }:
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
            excl_filters = ~excl_filters_tag & ~excl_filters_type
            if scope == "update" and action_dict.get("freeze"):
                excl_filters &= ~Q(
                    action__in=Subquery(group="fetch", used=True).values("id")
                )
            return {
                "filters": excl_filters
                & incl_filters_state
                & incl_filters_tag
                & incl_filters_type,
                "nets": action_dict.get("nets", []),
                "trustedKeys": action_dict.get("trustedKeys", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                # allowedTypes is invalid for update
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedReferences": action_dict.get(
                    "injectedReferences", []
                ),
                "accesslevel": ownaccesslevel,
            }
        elif issubclass(sender, Cluster):
            # disallow create new content / view cluster
            return {
                "filters": Q(),
                "trustedKeys": action_dict.get("trustedKeys", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                # allowedTypes is invalid for update
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedReferences": action_dict.get(
                    "injectedReferences", []
                ),
                "accesslevel": ownaccesslevel,
            }
        return None

    @staticmethod
    def clean_update(action_dict, request, content, authset, admin):
        result = {
            "action": "update",
            "contentActionGroup": "update",
            "restricted": bool(action_dict.get("restricted")),
            "freeze": bool(action_dict.get("freeze")),
            "nets": None,
            "injectedTags": [],
            "allowedTags": None,
            "allowedStates": action_dict.get("allowedStates", None),
            "injectedReferences": [],
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

        if action_dict.get("injectedTags"):
            result["injectedTags"].extend(action_dict["injectedTags"])
        if action_dict.get("allowedTags") is not None:
            result["allowedTags"] = list(action_dict["allowedTags"])
        if action_dict.get("allowedStates") is not None:
            result["allowedStates"] = list(action_dict["allowedStates"])

        nets = action_dict.get("nets")
        if nets:
            clusters = only_owned_helper(
                Cluster,
                nets,
                request,
                scope="create",
                fields=("id",),
                authset=authset,
                admin=admin,
            )
            action_dict["nets"] = Net.objects.filter(
                clusters__id__in=clusters
            ).values_list("id", flat=True)
            del clusters
        del nets
        references = action_dict.get("injectedReferences")
        if references:
            if isinstance(references, list):
                references = dict(map(lambda x: (x["target"], x), references))
            for _flexid, _id in only_owned_helper(
                Content,
                references.keys(),
                request,
                fields=("flexid", "id"),
                authset=authset,
            ):
                deleteRecursive = references[_flexid].get(
                    "deleteRecursive", constants.DeleteRecursive.TRUE.value
                )
                # TODO: specify nicer
                if (
                    deleteRecursive
                    not in constants.DeleteRecursive.valid_values
                ):
                    raise ValueError(
                        "invalid deleteRecursive specification "
                        "in injected reference"
                    )
                result["injectedReferences"].append(
                    {
                        "target": _id,
                        "group": references[_flexid].get("group", ""),
                        "deleteRecursive": deleteRecursive,
                    }
                )
        return result

    @staticmethod
    def do_create(action_dict, scope, sender, accesslevel, **kwargs):
        if scope == "create" and issubclass(sender, (Content, Cluster)):
            return {
                "action": "create",
                "trustedKeys": action_dict.get("trustedKeys", []),
                "filters": Q(),
                "accesslevel": 3,
                "nets": action_dict.get("nets", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                "allowedTypes": action_dict.get("allowedTypes", None),
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedReferences": action_dict.get(
                    "injectedReferences", []
                ),
            }
        return None

    @staticmethod
    def _clean_create_or_push(action_dict, request, content, authset, admin):
        result = {
            "id": content.id if content and content.id else None,
            "injectedTags": [],
            "injectedReferences": [],
            "nets": [],
            "allowedTags": None,
            "allowedStates": None,
            "allowedTypes": None,
        }
        if content.id:
            result["injectedReferences"].push(
                {
                    "group": "creator",
                    "target": content.id,
                    "deleteRecursive": (constants.DeleteRecursive.TRUE.value,),
                }
            )
        if action_dict.get("injectedTags"):
            result["injectedTags"].extend(action_dict["injectedTags"])
        if action_dict.get("allowedTags") is not None:
            result["allowedTags"] = list(action_dict["allowedTags"])
        if action_dict.get("allowedStates") is not None:
            result["allowedStates"] = list(action_dict["allowedStates"])
        if action_dict.get("allowedTypes") is not None:
            result["allowedTypes"] = list(action_dict["allowedTypes"])

        nets = action_dict.get("nets")
        if nets:
            clusters = only_owned_helper(
                Cluster,
                nets,
                request,
                scope="create",
                fields=("id",),
                authset=authset,
                admin=admin,
            )
            action_dict["nets"] = Net.objects.filter(
                clusters__id__in=clusters
            ).values_list("id", flat=True)
            del clusters
        del nets
        references = action_dict.get("injectedReferences")
        if references:
            if isinstance(references, list):
                references = dict(map(lambda x: (x["target"], x), references))
            for _flexid, _id in only_owned_helper(
                Content,
                references.keys(),
                request,
                fields=("flexid", "id"),
                authset=authset,
                admin=admin,
            ):
                deleteRecursive = references[_flexid].get(
                    "deleteRecursive", constants.DeleteRecursive.TRUE.value
                )
                # TODO: specify nicer
                if (
                    deleteRecursive
                    not in constants.DeleteRecursive.valid_values
                ):
                    raise ValueError(
                        "invalid deleteRecursive specification "
                        "in injected reference"
                    )
                result["injectedReferences"].append(
                    {
                        "target": _id,
                        "group": references[_flexid].get("group", ""),
                        "deleteRecursive": deleteRecursive,
                    }
                )
        del references
        return result

    @classmethod
    def clean_create(cls, action_dict, request, content, authset, admin):
        if content:
            raise ValueError("create invalid for content")
        result = cls._clean_create_or_push(
            action_dict, request, content=content, authset=authset, admin=admin
        )
        result["action"] = "create"
        return result

    @staticmethod
    def do_push(action_dict, scope, sender, accesslevel, **kwargs):
        if scope == "push":
            return {
                "action": "create",
                "trustedKeys": action_dict.get("trustedKeys", []),
                "filters": Q(),
                "accesslevel": 3,
                "nets": action_dict.get("nets", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                "allowedTypes": action_dict.get("allowedTypes", None),
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedReferences": action_dict.get(
                    "injectedReferences", []
                ),
                "updateable": bool(action_dict.get("updateable", True)),
                # freeze when fetched
                "freeze": bool(action_dict.get("freeze", False)),
            }
        if (
            scope == "view"
            and accesslevel < 1
            and issubclass(sender, Content)
            and action_dict.get("id")
        ):
            return {
                "action": "push",
                "trustedKeys": action_dict.get("trustedKeys", []),
                "filters": Q(id=action_dict["id"]),
                "accesslevel": 0,
                "nets": action_dict.get("nets", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                "allowedTypes": action_dict.get("allowedTypes", None),
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedReferences": action_dict.get(
                    "injectedReferences", []
                ),
                "updateable": bool(action_dict.get("updateable", True)),
                # freeze when fetched
                "freeze": bool(action_dict.get("freeze", False)),
            }
        return None

    @classmethod
    def clean_push(cls, action_dict, request, content, authset, admin):
        if not content:
            raise ValueError("push invalid for content")
        result = cls._clean_create_or_push(
            action_dict, request, content=content, authset=authset, admin=admin
        )
        result["action"] = "push"
        return result

    @staticmethod
    def do_manage(action_dict, scope, sender, action, **kwargs):
        type_name = sender.__name__
        excl_filters = Q(id__in=action_dict["exclude"][type_name])
        if type_name != "Cluster":
            excl_filters |= Q(cluster_id__in=action_dict["exclude"]["Cluster"])
        if type_name == "Action":
            excl_filters |= Q(
                contentAction__content_id__in=action_dict["exclude"]["Content"]
            )
        return {
            "trustedKeys": action_dict.get("trustedKeys", []),
            "nets": action_dict.get("nets", []),
            "filters": ~excl_filters,
            "accesslevel": 2,
        }

    @staticmethod
    def clean_manage(action_dict, request, content, authset, admin):
        from ...utils.auth import retrieve_allowed_objects

        if content:
            raise ValueError("manage cannot be used for content")
        result = {
            "action": "manage",
            "nets": [],
            "exclude": {"Cluster": [], "Content": [], "Action": []},
        }
        nets = action_dict.get("nets")
        if nets:
            clusters = only_owned_helper(
                Cluster,
                nets,
                request,
                scope="create",
                fields=("id",),
                authset=authset,
                admin=admin,
            )
            action_dict["nets"] = Net.objects.filter(
                clusters__id__in=clusters
            ).values_list("id", flat=True)
            del clusters
        del nets
        for idtuple in action_dict.get("exclude") or []:
            type_name, id = relay.from_base64(idtuple)
            result["exclude"][type_name].append(id)
        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            # for passing down exclude info
            r = retrieve_allowed_objects(
                request,
                klass.objects.filter(keyHash__in=result["exclude"][type_name])
                if type_name == "Action"
                else klass.objects.filter(
                    flexid__in=result["exclude"][type_name]
                ),
                scope="manage",
                authset=[] if admin else authset,
            )
            s = set(r["objects"].values_list("id", flat=True))
            # now add exclude infos of authset
            for action in r["decrypted"]:
                if action["action"] == "manage":
                    s.update(action["exclude"].get(type_name, []))
            result["exclude"][type_name] = list(s)
        return result
