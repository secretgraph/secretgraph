from django.db.models import Exists, OuterRef, Q
from strawberry import relay

from ....core import constants
from ...models import Action, Cluster, Content, ContentTag, Net
from ._shared import get_forbidden_content_ids, only_owned_helper


class UpdateHandlers:
    @staticmethod
    async def do_delete(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "delete":
            return None
        ownaccesslevel = 3
        if accesslevel > ownaccesslevel:
            return None

        if issubclass(sender, Content):
            excl_filters = Q(
                Exists(
                    ContentTag.objects.filter(
                        content_id=OuterRef("pk"),
                        tag="immutable",
                    )
                )
            )
            if action_dict.get("excludeIds"):
                excl_filters |= Q(id__in=action_dict["excludeIds"])
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
        elif issubclass(sender, Cluster) and not hasattr(action, "contentAction"):
            return {
                "filters": Q(),
                "accesslevel": ownaccesslevel,
            }
        return None

    @staticmethod
    async def clean_delete(action_dict, request, cluster, content, admin):
        result = {"action": "delete", "contentActionGroup": "delete"}
        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
            result["states"] = []
            result["includeTypes"] = []
            result["excludeTypes"] = []
            result["excludeIds"] = []
        else:
            result["excludeIds"] = list(await get_forbidden_content_ids(request))
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
    async def do_update(action_dict, scope, sender, accesslevel, **kwargs):
        if scope in {"update", "peek"}:
            ownaccesslevel = 1
        else:
            ownaccesslevel = 0
        if accesslevel > ownaccesslevel or scope not in {
            "update",
            "view",
            "link",
            "peek",
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
            excl_filters = excl_filters_tag | excl_filters_type

            if action_dict.get("excludeIds"):
                excl_filters |= Q(id__in=action_dict["excludeIds"])
            if scope == "update":
                excl_filters |= ~Q(tags__tag="immutable")
            return {
                "filters": ~excl_filters
                & incl_filters_state
                & incl_filters_tag
                & incl_filters_type,
                "nets": action_dict.get("nets", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                # allowedTypes is invalid for update
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": [],
                "injectedReferences": action_dict.get("injectedReferences", []),
                "accesslevel": ownaccesslevel,
            }
        elif issubclass(sender, Cluster):
            # disallow create new content / view cluster
            return {
                "filters": Q(),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                # allowedTypes is invalid for update
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": [],
                "injectedReferences": action_dict.get("injectedReferences", []),
                "accesslevel": ownaccesslevel,
            }
        return None

    @staticmethod
    async def clean_update(action_dict, request, cluster, content, admin):
        result = {
            "action": "update",
            "contentActionGroup": "update",
            "nets": None,
            "injectedTags": [],
            "allowedTags": None,
            "allowedStates": action_dict.get("allowedStates", None),
            "allowedActions": [],
            "injectedReferences": [],
        }
        if action_dict.get("includeTypes") and action_dict.get("excludeTypes"):
            raise ValueError("Either includeTypes or excludeTypes should be specified")

        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
            result["states"] = []
            result["includeTypes"] = []
            result["excludeTypes"] = []
            result["excludeIds"] = []
        else:
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

        if action_dict.get("allowedActions"):
            result["allowedActions"].extend(
                action_dict["allowedActions"].filter(
                    lambda x: x not in {"manage", "admin"}
                )
            )

        if action_dict.get("injectedTags"):
            result["injectedTags"].extend(action_dict["injectedTags"])
        if action_dict.get("allowedTags") is not None:
            result["allowedTags"] = list(action_dict["allowedTags"])
        if action_dict.get("allowedStates") is not None:
            result["allowedStates"] = list(action_dict["allowedStates"])

        nets = action_dict.get("nets")
        if nets:
            clusters = await only_owned_helper(
                Cluster,
                nets,
                request,
                scope="create",
                fields=("id",),
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
            for _flexid, _id in await only_owned_helper(
                Content,
                references.keys(),
                request,
                fields=("flexid", "id"),
            ):
                deleteRecursive = references[_flexid].get(
                    "deleteRecursive", constants.DeleteRecursive.TRUE.value
                )
                # TODO: specify nicer
                if deleteRecursive not in constants.DeleteRecursive.valid_values:
                    raise ValueError(
                        "invalid deleteRecursive specification " "in injected reference"
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
    async def do_create(action_dict, scope, sender, accesslevel, **kwargs):
        if scope == "create" and issubclass(sender, (Content, Cluster)):
            return {
                "action": "create",
                "filters": Q(),
                "accesslevel": 3,
                "nets": action_dict.get("nets", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                "allowedTypes": action_dict.get("allowedTypes", None),
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedReferences": action_dict.get("injectedReferences", []),
            }
        return None

    @staticmethod
    async def _clean_create_or_push(action_dict, request, cluster, content, admin):
        result = {
            "id": content.id if content and content.id else None,
            "injectedTags": [],
            "injectedReferences": [],
            "nets": [],
            "allowedTags": None,
            "allowedStates": None,
            "allowedTypes": None,
            "allowedActions": [],
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
            clusters = await only_owned_helper(
                Cluster,
                nets,
                request,
                scope="create",
                fields=("id",),
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
            for _flexid, _id in await only_owned_helper(
                Content,
                references.keys(),
                request,
                fields=("flexid", "id"),
                admin=admin,
                scope="link",
            ):
                deleteRecursive = references[_flexid].get(
                    "deleteRecursive", constants.DeleteRecursive.TRUE.value
                )
                # TODO: specify nicer
                if deleteRecursive not in constants.DeleteRecursive.valid_values:
                    raise ValueError(
                        "invalid deleteRecursive specification " "in injected reference"
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
    async def clean_create(cls, action_dict, request, cluster, content, admin):
        if content:
            raise ValueError("create invalid for content")
        result = await cls._clean_create_or_push(
            action_dict, request, content=content, admin=admin
        )
        if action_dict.get("allowedActions"):
            result["allowedActions"].extend(
                action_dict["allowedActions"].filter(lambda x: x != "manage")
            )

        result["action"] = "create"
        return result

    @staticmethod
    async def do_push(action_dict, scope, sender, accesslevel, **kwargs):
        if scope == "push":
            return {
                "action": "create",
                "filters": Q(),
                "accesslevel": 3,
                "nets": action_dict.get("nets", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                "allowedTypes": action_dict.get("allowedTypes", None),
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": [],
                "injectedReferences": action_dict.get("injectedReferences", []),
                "updateable": bool(action_dict.get("updateable", True)),
            }
        if (
            scope in {"view", "link"}
            and accesslevel < 1
            and issubclass(sender, Content)
            and action_dict.get("id")
        ):
            return {
                "action": "push",
                "filters": Q(id=action_dict["id"]),
                "accesslevel": 0,
                "nets": action_dict.get("nets", []),
                "injectedTags": action_dict.get("injectedTags", []),
                "allowedTags": action_dict.get("allowedTags", None),
                "allowedTypes": action_dict.get("allowedTypes", None),
                "allowedStates": action_dict.get("allowedStates", None),
                "allowedActions": action_dict.get("allowedActions", None),
                "injectedReferences": action_dict.get("injectedReferences", []),
                "updateable": bool(action_dict.get("updateable", True)),
            }
        return None

    @classmethod
    async def clean_push(cls, action_dict, request, cluster, content, admin):
        if not content:
            raise ValueError("push invalid for content")
        result = await cls._clean_create_or_push(
            action_dict, request, content=content, admin=admin
        )
        result["action"] = "push"
        return result

    @staticmethod
    async def do_manage(action_dict, scope, sender, action, **kwargs):
        # can handle all scopes except admin
        if scope == "admin":
            return None
        # handles Action, Content, Cluster
        type_name = sender.__name__
        excl_filters = Q(id__in=action_dict["exclude"][type_name])
        if type_name != "Cluster":
            excl_filters |= Q(cluster_id__in=action_dict["exclude"]["Cluster"])
        if type_name == "Action":
            excl_filters |= Q(
                contentAction__content_id__in=action_dict["exclude"]["Content"]
            )
        if action == "update" and type_name == "Content":
            excl_filters |= Q(
                Exists(
                    ContentTag.objects.filter(
                        content_id=OuterRef("pk"),
                        tag="immutable",
                    )
                )
            )
        return {
            "nets": action_dict.get("nets", []),
            "filters": ~excl_filters,
            "accesslevel": 2,
        }

    @staticmethod
    async def clean_manage(action_dict, request, cluster, content, admin):
        from ...utils.auth import fetch_by_id, get_cached_result

        if content:
            raise ValueError("manage cannot be used for content")
        result = {
            "action": "manage",
            "nets": [],
            "exclude": {"Cluster": [], "Content": [], "Action": []},
        }
        # FIXME: exclude Cluster and add documentation
        # FIXME: exclusion broken
        # add additional nets which can be used
        nets = action_dict.get("nets")
        if nets:
            clusters = await only_owned_helper(
                Cluster,
                nets,
                request,
                scope="create",
                fields=("id",),
                admin=admin,
            )
            action_dict["nets"] = [
                val
                async for val in Net.objects.filter(
                    clusters__id__in=clusters
                ).values_list("id", flat=True)
            ]
            del clusters
        del nets
        # extract exclusion
        for idtuple in action_dict.get("exclude") or []:
            type_name, id = relay.from_base64(idtuple)
            if type_name in {"Cluster", "Content", "Action"}:
                # FIXME: only flexid is added not id
                result["exclude"][type_name].append(id)
        res_action = await get_cached_result(
            request,
            scope="manage",
            cacheName="secretgraphCleanResult",
            ensureInitialized=True,
        ).aat("Action")
        # ???????????????????
        for klass in [Content, Action]:
            type_name = klass.__name__
            if isinstance(klass, Action):
                objs = res_action["objects_without_public"].filter(
                    keyHash__in=result["exclude"][type_name]
                )
            else:
                r = await get_cached_result(
                    request,
                    scope="manage",
                    cacheName="secretgraphCleanResult",
                    ensureInitialized=True,
                ).aat(type_name)
                objs = fetch_by_id(
                    r["objects_without_public"],
                    result["exclude"][type_name],
                    limit_ids=None,
                )

            s = {val for val in objs.values_list("id", flat=True)}
            # now add exclude infos (if not admin)
            # note: manage always resolves, so this is valid
            for action in res_action["action_results"].values():
                if action["value"]["action"] in {"manage", "admin"}:
                    s.update(action["value"]["exclude"].get(type_name, []))
            result["exclude"][type_name] = list(s)
        return result

    @staticmethod
    async def do_admin(action_dict, scope, sender, action, **kwargs):
        # handles Cluster
        type_name = sender.__name__

        if (
            scope != "admin"
            or type_name != "Cluster"
            or not await Net.objects.filter(primaryCluster=action.cluster).aexists()
        ):
            return None
        excl_filters = Q(id__in=action_dict["exclude"])
        return {
            "nets": action_dict.get("nets", []),
            "filters": ~excl_filters,
            "accesslevel": 3,
        }

    @staticmethod
    async def clean_admin(action_dict, request, cluster, content, admin):
        from ...utils.auth import fetch_by_id, get_cached_result

        if content:
            raise ValueError("admin cannot be used for content")
        result = {
            "action": "admin",
            "nets": [],
            "exclude": [],
        }
        result_clusters = await get_cached_result(
            request,
            scope="manage",
            cacheName="secretgraphCleanResult",
            ensureInitialized=True,
        ).aat("Cluster")
        exclude_flexids = set()
        for idtuple in action_dict.get("exclude") or []:
            type_name, id = relay.from_base64(idtuple)
            if type_name == "Cluster":
                exclude_flexids.add(id)
        ids = fetch_by_id(
            result_clusters["objects_without_public"],
            exclude_flexids,
            limit_ids=None,
            check_long=False,
            check_short_id=True,
            check_short_name=True,
        ).values_list("id", flat=True)
        exclude_ids = {plainid async for plainid in ids}
        for action in result_clusters["action_results"].values():
            # only defined for cluster
            if action["value"]["action"] == "manage":
                exclude_ids.update(action["value"]["exclude"].get("Cluster", []))
            elif action["value"]["action"] == "admin":
                exclude_ids.update(action["value"]["exclude"])
        result["exclude"].extend(exclude_ids)

        return result
