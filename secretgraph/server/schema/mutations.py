
import base64
import logging
import os
import re
from datetime import timedelta as td
from itertools import chain

import graphene
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from graphene import relay

from ...utils.auth import (
    id_to_result, initializeCachedResult, retrieve_allowed_objects
)
from ..actions.update import (
    create_cluster, create_content, update_cluster, update_content
)
from ..models import Cluster, Content
from ..signals import generateFlexid
from .arguments import AuthList, ClusterInput, ContentInput, PushContentInput
from .definitions import ClusterNode, ContentNode, FlexidType

logger = logging.getLogger(__name__)


class RegenerateFlexidMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        authorization = AuthList()

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id, authorization=None):
        result = id_to_result(
            info.context, id, (Content, Cluster), "update",
            authset=authorization
        )
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        obj = result["objects"].first()
        if not obj:
            raise ValueError("Object not found")
        generateFlexid(type(obj), obj, True)
        initializeCachedResult(info.context, authset=authorization)
        return cls(node=obj)


class DeleteContentOrClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        authorization = AuthList()

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id, authorization=None):
        now = timezone.now()
        now_plus_x = now + td(minutes=20)
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        result = id_to_result(
            info.context, id, (Content, Cluster), "delete",
            authset=authorization
        )
        obj = result["objects"].first()
        if not obj:
            raise ValueError("Object does not exist")
        ret = cls(node=obj)
        if isinstance(obj, Content):
            if (
                not obj.markForDestruction or
                obj.markForDestruction > now_plus_x
            ):
                obj.markForDestruction = now_plus_x
                obj.save(update_fields=["markForDestruction"])
        elif isinstance(obj, Cluster):
            if not obj.contents.exists():
                obj.delete()
            else:
                obj.contents.filter(
                    Q(markForDestruction__isnull=True) |
                    Q(markForDestruction__gt=now_plus_x)
                ).update(markForDestruction=now_plus_x)
                if not obj.markForDestruction or obj.markForDestruction > now:
                    obj.markForDestruction = now
                    obj.save(update_fields=["markForDestruction"])
        initializeCachedResult(info.context, authset=authorization)
        return ret


class ResetDeletionContentOrClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        authorization = AuthList()

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id, authorization=None):
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    clusters = retrieve_allowed_objects(
        #        info, "manage", clusters
        #    )
        result = id_to_result(
            info.context, id, (Content, Cluster), "delete",
            authset=authorization
        )
        obj = result["objects"].first()
        if not obj:
            raise ValueError("Object does not exist")
        if isinstance(obj, Content):
            obj.markForDestruction = None
            obj.save(update_fields=["markForDestruction"])
            if obj.cluster.markForDestruction:
                obj.cluster.markForDestruction = None
                obj.cluster.save(update_fields=["markForDestruction"])
        elif isinstance(obj, Cluster):
            obj.contents.filter(
                markForDestruction__isnull=False
            ).update(markForDestruction=None)
            obj.markForDestruction = None
            obj.save(update_fields=["markForDestruction"])
        initializeCachedResult(info.context, authset=authorization)
        return cls(node=obj)


class ClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        cluster = ClusterInput(required=False)
        authorization = AuthList()

    cluster = graphene.Field(ClusterNode)
    actionKey = graphene.String(required=False)

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, id=None, cluster=None, authorization=None
    ):
        if id:
            if not cluster:
                raise ValueError()
            result = id_to_result(
                info.context, id, Cluster, "manage",
                authset=authorization
            )
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError()
            returnval = cls(cluster=update_cluster(
                cluster_obj, cluster, info.context
            ))
        else:
            user = None
            manage = retrieve_allowed_objects(
                info.context, "manage", Cluster.objects.all(),
                authset=authorization
            )["objects"].first()

            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if manage:
                    user = manage.user
                if not user:
                    user = getattr(info.context, "user", None)
                if not user or not user.is_authenticated:
                    raise ValueError("Must be logged in")
            elif (
                getattr(
                    settings, "SECRETGRAPH_ALLOW_REGISTER", False
                ) == "cluster" and
                not manage.exist()
            ):
                raise ValueError("Cannot register new cluster")
            elif getattr(
                settings, "SECRETGRAPH_ALLOW_REGISTER", False
            ) is not True:
                raise ValueError("Cannot register new cluster")
            _cluster, action_key = create_cluster(
                info.context, cluster, user=user
            )
            returnval = cls(
                cluster=_cluster,
                actionKey=(
                    action_key and base64.b64encode(action_key).decode("ascii")
                )
            )
        initializeCachedResult(info.context, authset=authorization)
        return returnval


class ContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        content = graphene.Field(ContentInput, required=True)
        authorization = AuthList()
        key = graphene.String(
            required=False,
            description=(
                "key of content (can be used for server-side encryption)"
            )
        )

    content = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, content, id=None, key=None, authorization=None
    ):
        if id:
            result = id_to_result(
                info.context, id, Content, "update",
                authset=authorization
            )
            content_obj = result["objects"].first()
            if not content_obj:
                raise ValueError()
            required_keys = []
            try:
                form = next(iter(result["forms"].values()))
                # None should be possible here for not updating
                if content.get("info") is not None:
                    allowed = form.get("allowInfo", None)
                    if allowed is not None:
                        matcher = re.compile(
                            "^(?:%s)(?:(?<==)|$)" % "|".join(map(
                                re.escape,
                                allowed
                            ))
                        )
                        content["info"] = filter(
                            lambda x: matcher.fullmatch(x),
                            content["info"]
                        )
                    content["info"] = chain(
                        form.get("injectInfo", []),
                        content["info"]
                    )
                # None should be possible here for not updating
                if content.get("references") is not None:
                    content["references"] = chain(
                        form.get("injectReferences", []),
                        content["references"]
                    )
                required_keys = form.get("requiredKeys", [])
            except StopIteration:
                pass
            returnval = cls(
                content=update_content(
                    info.context,
                    content_obj,
                    content,
                    key=key,
                    required_keys=required_keys,
                    authset=authorization
                )
            )
        else:
            result = id_to_result(
                info.context, content.cluster, Cluster, "create",
                authset=authorization
            )
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError("Cluster for Content not found")

            required_keys = list(
                Content.objects.injected_keys().values_list(
                    "contentHash", flat=True
                )
            )
            try:
                form = next(iter(result["forms"].values()))
                content["info"] = chain(
                    form.get("info", []),
                    content.get("info") or []
                )
                content["references"] = chain(
                    form.get("injectReferences", []),
                    content.get("references") or []
                )
                required_keys.extend(form.get("requiredKeys", []))
            except StopIteration:
                pass
            returnval = cls(
                content=create_content(
                    info.context, content,
                    key=key,
                    required_keys=required_keys, authset=authorization
                )
            )
        initializeCachedResult(info.context, authset=authorization)
        return returnval


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        content = graphene.Field(PushContentInput, required=True)
        authorization = AuthList()
        key = graphene.String(required=False)

    content = graphene.Field(ContentNode)
    actionKey = graphene.String(required=False)

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, content, key=False, authorization=None
    ):
        parent_id = content.pop("parent")
        result = id_to_result(
            info.context, parent_id, Content, "push",
            authset=authorization
        )
        source = result["objects"].first()
        if not source:
            raise ValueError("Content not found")
        form = result["forms"][source.actions.get(group="push").id]
        if content.get("info") is not None:
            allowed = form.get("allowInfo", None)
            if allowed is not None:
                matcher = re.compile(
                    "^(?:%s)(?:(?<==)|$)" % "|".join(map(
                        re.escape,
                        allowed
                    ))
                )
                content["info"] = filter(
                    lambda x: matcher.fullmatch(x),
                    content["info"]
                )
            content["info"] = chain(
                form.get("injectInfo", []),
                content["info"]
            )
        else:
            content["info"] = form.get("injectInfo") or []
        if content.get("references") is not None:
            content["references"] = chain(
                form.get("injectReferences", []),
                content["references"]
            )
        else:
            content["references"] = form.get("injectReferences") or []
        required_keys = list(
            Content.objects.injected_keys().values_list(
                "contentHash", flat=True
            )
        )
        required_keys.extend(form.get("requiredKeys", []))
        action_key = None
        if form.pop("updateable", False):
            action_key = os.urandom(32)
            content["actions"] = [{
                "key": action_key,
                "action": "update",
                "restrict": True,
                "form": form
            }]
        c = create_content(
            info.context, content, key=key, required_keys=required_keys
        )
        initializeCachedResult(info.context, authset=authorization)
        return cls(
            content=c,
            actionKey=base64.b64encode(action_key).decode("ascii")
        )
