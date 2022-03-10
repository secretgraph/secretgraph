import json
from datetime import timedelta as td, datetime as dt
from functools import lru_cache

from django.db.models import Q, Subquery
from django.utils import timezone
from graphql_relay import from_global_id

from ..models import Action, Cluster, Content
from ... import constants


def _only_owned_helper(
    klass,
    linput,
    request,
    fields=("id",),
    check_field=None,
    scope="manage",
    authset=None,
):
    from ..utils.auth import retrieve_allowed_objects

    if not check_field:
        check_field = "flexid"
    if check_field == "flexid" and not hasattr(klass, "flexid"):
        check_field = "id"
    if not hasattr(klass, "flexid"):
        fields = set(fields).difference({"flexid"})
    return retrieve_allowed_objects(
        request,
        scope,
        klass.objects.filter(**{f"{check_field}__in": linput or []}),
        authset=authset,
    )["objects"].values_list(*fields, flat=True)


@lru_cache()
def get_valid_fields(klass):
    if isinstance(klass, str):
        from django.apps import apps

        klass = apps.get_model("secretgraph", klass)
    return {
        name: klass.__annotations__[name]
        for name in set(map(lambda x: x.name, klass._meta.get_fields()))
        .difference(
            ("id", "cluster", "cluster_id", "references", "referencedBy")
        )
        .union(klass.__annotations__.keys())
    }


class ActionHandler:
    @classmethod
    def handle_action(cls, sender, action_dict, **kwargs):
        return getattr(cls, "do_%s" % action_dict["action"], "default")(
            action_dict, sender=sender, **kwargs
        )

    @classmethod
    def clean_action(cls, action_dict, request, authset, content=None):
        action = action_dict["action"]
        result = getattr(cls, "clean_%s" % action)(
            action_dict, request, content, authset
        )
        assert result["action"] == action
        return result

    @staticmethod
    def default(action_dict, **kwargs):
        return None

    @staticmethod
    def do_auth(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "auth":
            return None
        action.delete()

        if issubclass(sender, Content):
            excl_filters = Q(type="PrivateKey")
            for i in action_dict["excludeTags"]:
                excl_filters |= Q(tags__tag__startswith=i)

            incl_filters = Q()
            for i in action_dict["includeTags"]:
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
            result["types"] = []
            result["excludeTags"] = []
            result["includeTags"] = []
        else:
            types = action_dict.get("types", [])
            result["types"] = list(map(str, types))
            exclude_tags = action_dict.get("excludeTags", [])
            result["excludeTags"] = list(map(str, exclude_tags))
            include_tags = action_dict.get("includeTags", [])
            result["includeTags"] = list(map(str, include_tags))
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
            for i in action_dict["excludeTags"]:
                excl_filters |= Q(tags__tag__startswith=i)

            incl_filters = Q()
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
        else:
            exclude_tags = action_dict.get("excludeTags", [])
            result["excludeTags"] = list(map(str, exclude_tags))
            include_tags = action_dict.get("includeTags", [])
            result["includeTags"] = list(map(str, include_tags))
        return result

    @staticmethod
    def do_delete(action_dict, scope, sender, accesslevel, action, **kwargs):
        if scope != "delete":
            return None
        ownaccesslevel = 1
        if accesslevel > ownaccesslevel:
            return None

        if issubclass(sender, Content):
            excl_filters = Q()
            for i in action_dict["excludeTags"]:
                excl_filters |= Q(tags__tag__startswith=i)

            incl_filters = Q()
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
        elif issubclass(sender, Cluster):
            return {
                "filters": Q(),
                "accesslevel": ownaccesslevel,
                "trustedKeys": action_dict.get("trustedKeys", []),
            }
        return None

    @staticmethod
    def clean_delete(action_dict, request, content, authset):
        result = {"action": "delete", "contentActionGroup": "delete"}
        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
        else:
            exclude_tags = action_dict.get("excludeTags", [])
            result["excludeTags"] = list(map(str, exclude_tags))
            include_tags = action_dict.get("includeTags", [])
            result["includeTags"] = list(map(str, include_tags))
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
            excl_filters = Q()
            for i in action_dict["excludeTags"]:
                excl_filters |= Q(tags__tag__startswith=i)

            incl_filters = Q()
            for i in action_dict["includeTags"]:
                if i.startswith("id="):
                    incl_filters |= Q(flexid_cached=i[3:])
                elif i.startswith("=id="):
                    incl_filters |= Q(flexid_cached=i[4:])
                elif i.startswith("="):
                    incl_filters |= Q(tags__tag=i[1:])
                else:
                    incl_filters |= Q(tags__tag__startswith=i)
            if scope == "update" and action_dict.get("freeze"):
                excl_filters = Q(
                    action__in=Subquery(group="fetch", used=True).values("id")
                )
            return {
                "filters": ~excl_filters & incl_filters,
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
    def clean_update(action_dict, request, content, authset):
        result = {
            "action": "update",
            "contentActionGroup": "update",
            "restricted": bool(action_dict.get("restricted")),
            "freeze": bool(action_dict.get("freeze")),
            "injectedTags": [],
            "allowedTags": None,
            "allowedStates": action_dict.get("allowedStates", None),
            "injectedReferences": [],
        }

        if content:
            # ignore tags if specified for a content
            result["excludeTags"] = []
            result["includeTags"] = []
        else:
            exclude_tags = action_dict.get("excludeTags", ["type=PrivateKey"])
            result["excludeTags"] = list(map(str, exclude_tags))
            include_tags = action_dict.get("includeTags", [])
            result["includeTags"] = list(map(str, include_tags))

        if action_dict.get("injectedTags"):
            result["injectedTags"].extend(action_dict["injectedTags"])
        if action_dict.get("allowedTags") is not None:
            result["allowedTags"] = list(action_dict["allowedTags"])
        if action_dict.get("allowedStates") is not None:
            result["allowedStates"] = list(action_dict["allowedStates"])
        references = action_dict.get("injectedReferences")
        if references:
            if isinstance(references, list):
                references = dict(map(lambda x: (x["target"], x), references))
            for _flexid, _id in _only_owned_helper(
                Content,
                references.keys(),
                request,
                fields=("flexid",),
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
    def do_inject(action_dict, scope, sender, accesslevel, **kwargs):
        if scope in {"create", "update", "push"} and issubclass(
            sender, (Content, Cluster)
        ):
            return {
                "action": "inject",
                "trustedKeys": action_dict.get("trustedKeys", []),
                "filters": Q(),
                "accesslevel": -1,
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
    def clean_inject(action_dict, request, content, authset):
        result = {
            "id": content.id if content and content.id else None,
            "injectedTags": [],
            "injectedReferences": [],
            "allowedTags": None,
            "allowedStates": None,
            "allowedTypes": None,
        }

        if action_dict.get("injectedTags"):
            result["injectedTags"].extend(action_dict["injectedTags"])
        if action_dict.get("allowedTags") is not None:
            result["allowedTags"] = list(action_dict["allowedTags"])
        if action_dict.get("allowedStates") is not None:
            result["allowedStates"] = list(action_dict["allowedStates"])
        if action_dict.get("allowedTypes") is not None:
            result["allowedTypes"] = list(action_dict["allowedTypes"])
        references = action_dict.get("injectedReferences")
        if references:
            if isinstance(references, list):
                references = dict(map(lambda x: (x["target"], x), references))
            for _flexid, _id in _only_owned_helper(
                Content,
                references.keys(),
                request,
                fields=("flexid",),
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
    def _clean_create_or_push(action_dict, request, content, authset):
        result = {
            "id": content.id if content and content.id else None,
            "injectedTags": [],
            "injectedReferences": [],
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
        references = action_dict.get("injectedReferences")
        if references:
            if isinstance(references, list):
                references = dict(map(lambda x: (x["target"], x), references))
            for _flexid, _id in _only_owned_helper(
                Content,
                references.keys(),
                request,
                fields=("flexid",),
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

    @classmethod
    def clean_create(cls, action_dict, request, content, authset):
        if content:
            raise ValueError("create invalid for content")
        result = cls._clean_create_or_push(
            action_dict, request, content, authset
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
    def clean_push(cls, action_dict, request, content, authset):
        if not content:
            raise ValueError("push invalid for content")
        result = cls._clean_create_or_push(
            action_dict, request, content, authset
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
            "filters": ~excl_filters,
            "accesslevel": 2,
        }

    @staticmethod
    def clean_manage(action_dict, request, content, authset):
        if content:
            raise ValueError("manage cannot be used for content")
        result = {
            "action": "manage",
            "exclude": {"Cluster": [], "Content": [], "Action": []},
        }
        # TODO: Maybe fixed. Pass down excludes from old manage
        for idtuple in action_dict.get("exclude") or []:
            type_name, id = from_global_id(idtuple)
            result["exclude"][type_name].append(id)
        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            result["exclude"][type_name] = list(
                _only_owned_helper(
                    klass,
                    result["exclude"][type_name],
                    request,
                    check_field="keyHash"
                    if type_name == "Action"
                    else "flexid",
                    authset=authset,
                )
            )
        return result

    @staticmethod
    def do_storedUpdate(action_dict, scope, **kwargs):
        now = timezone.now()
        mintime = dt.strptime(
            action_dict["minExpire"], r"%a, %d %b %Y %H:%M:%S %z"
        )
        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            if action_dict["delete"][type_name]:
                if type_name == "Action" or now >= mintime:
                    klass.objects.filter(
                        id__in=action_dict["delete"][type_name]
                    ).delete()
                elif type_name == "Content":
                    Content.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        id__in=action_dict["delete"][type_name],
                    ).update(markForDestruction=mintime)
                elif type_name == "Component":
                    Content.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        cluster_id__in=action_dict["delete"][type_name],
                    ).update(markForDestruction=mintime)
                    Cluster.objects.filter(
                        Q(markForDestruction__isnull=True)
                        | Q(markForDestruction__gt=mintime),
                        id__in=action_dict["delete"][type_name],
                    ).update(markForDestruction=mintime)
            for _id, updatevalues in action_dict["update"][type_name].items():
                updatevalues.pop("id", None)
                updatevalues.pop("cluster", None)
                updatevalues.pop("references", None)
                updatevalues.pop("referencedBy", None)
                klass.objects.filter(id=_id).update(updatevalues)
        return None

    @staticmethod
    def clean_storedUpdate(action_dict, request, content, authset):
        if content:
            raise ValueError("storedUpdate cannot be used as contentaction")
        now_plus_x = timezone.now() + td(minutes=20)
        result = {
            "action": "storedUpdate",
            "delete": {"Cluster": [], "Content": [], "Action": []},
            "update": {"Cluster": {}, "Content": {}, "Action": {}},
            "minExpire": now_plus_x.strftime(r"%a, %d %b %Y %H:%M:%S %z"),
        }
        update_mapper = {"Cluster": {}, "Content": {}, "Action": {}}

        for idtuple in action_dict.get("delete") or []:
            if ":" in idtuple:
                type_name, id = from_global_id(idtuple)
                if type_name not in {"Content", "Cluster"}:
                    raise ValueError("Invalid idtype")
                result["delete"][type_name].append(id)
            else:
                result["delete"][type_name].append(idtuple)

        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            result["delete"][type_name] = list(
                _only_owned_helper(
                    klass,
                    result["delete"][type_name],
                    request,
                    check_field="keyHash" if type_name == "Action" else None,
                    authset=authset,
                )
            )

        _del_sets = {
            "Cluster": set(result["delete"]["Cluster"]),
            "Content": set(result["delete"]["Content"]),
            "Action": set(result["delete"]["Action"]),
        }

        for jsonob in action_dict.get("update") or []:
            if isinstance(jsonob, str):
                jsonob = json.loads(jsonob)
            newob = {}
            type_name, idpart = from_global_id(jsonob["id"])
            for name, field_type in get_valid_fields(type_name):
                if name in jsonob:
                    if not isinstance(jsonob[name], field_type):
                        raise ValueError(
                            "Invalid field type (%s) for: %s"
                            % (type(jsonob[name]), name)
                        )
                    if name == "flexid":
                        # autogenerate new flexid
                        newob[name] = None
                    else:
                        newob[name] = jsonob[name]
            update_mapper[type_name][idpart] = newob

        for klass in [Cluster, Content, Action]:
            type_name = klass.__name__
            for _flexid, _id in _only_owned_helper(
                klass,
                update_mapper[type_name].keys(),
                request,
                fields=(
                    ("id", "id") if type_name == "Action" else ("flexid", "id")
                ),
                authset=authset,
            ):
                if _id in _del_sets[type_name]:
                    continue
                result["update"][type_name][_id] = update_mapper[type_name][
                    _flexid
                ]
        return result
