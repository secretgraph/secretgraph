
import os
import logging
from datetime import timedelta as td

import graphene
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from graphene import relay

from ...utils.auth import retrieve_allowed_objects, id_to_result
from ..actions.update import (
    create_cluster, create_content, update_cluster, update_content
)
from ..models import Cluster, Content
from ..signals import generateFlexid
from .arguments import (
    ClusterInput, ContentInput, ContentValueInput, ReferenceInput
)
from .definitions import ClusterNode, ContentNode, FlexidType


logger = logging.getLogger(__name__)


class RegenerateFlexidMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        result = id_to_result(info.context, id, (Content, Cluster), "update")
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        obj = result["objects"].first()
        if not obj:
            raise ValueError()
        generateFlexid(type(obj), obj, True)
        return cls(node=obj)


class DeleteContentOrClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        now = timezone.now()
        now_plus_x = now + td(minutes=20)
        # cleanup expired
        Content.objects.filter(
            mark_for_destruction__lte=now
        ).delete()
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        result = id_to_result(info.context, id, (Content, Cluster), "delete")
        obj = result["objects"].first()
        if not obj:
            raise ValueError()
        ret = cls(node=obj)
        if isinstance(obj, Content):
            if (
                not obj.mark_for_destruction or
                obj.mark_for_destruction > now_plus_x
            ):
                obj.mark_for_destruction = now_plus_x
                obj.save(update_fields=["mark_for_destruction"])
        elif isinstance(obj, Cluster):
            if not obj.contents.exists():
                obj.delete()
            else:
                obj.contents.filter(
                    Q(mark_for_destruction__isnull=True) |
                    Q(mark_for_destruction__gt=now_plus_x)
                ).update(mark_for_destruction=now_plus_x)
        return ret


class ResetDeletionContentOrClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    clusters = retrieve_allowed_objects(
        #        info, "manage", clusters
        #    )
        result = id_to_result(info.context, id, (Content, Cluster), "delete")
        obj = result["objects"].first()
        if not obj:
            raise ValueError()
        ret = cls(node=obj)
        if isinstance(obj, Content):
            obj.mark_for_destruction = None
            obj.save(update_fields=["mark_for_destruction"])
        elif isinstance(obj, Cluster):
            obj.contents.filter(
                mark_for_destruction__isnull=False
            ).update(mark_for_destruction=None)
        return ret


class ClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        cluster = ClusterInput(required=False)
        password = graphene.String(required=False)

    cluster = graphene.Field(ClusterNode)
    actionKey = graphene.String(required=False)
    privateKey = graphene.String(required=False)
    keyForPrivateKey = graphene.String(required=False)

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, id=None, cluster=None, password=None
    ):
        if id:
            if not cluster:
                raise ValueError()
            result = id_to_result(info.context, id, Cluster, "manage")
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError()
            return cls(cluster=update_cluster(
                cluster_obj, cluster, info.context
            ))
        else:
            user = None
            manage = retrieve_allowed_objects(
                info.context, "manage", Cluster.actions.all()
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
            _cluster, action_key, privateKey, key_for_privateKey = \
                create_cluster(
                    info.context, cluster, user, password=password
                )
            return cls(
                cluster=_cluster,
                actionKey=action_key,
                privateKey=privateKey,
                keyForPrivateKey=key_for_privateKey
            )


class ContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        content = graphene.Field(ContentInput, required=True)
        key = graphene.String(required=getattr(
            settings, "SECRETGRAPH_SERVERSIDE_ENCRYPTION", False
        ))

    content = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, content, id=None, key=None
    ):
        if id:
            result = id_to_result(info.context, id, Content, "update")
            content_obj = result["objects"].first()
            if not content_obj:
                raise ValueError()
            required_keys = []
            try:
                form = next(iter(result["objects"].keys()))
                if content.get("info") is not None:
                    content["info"] = form.get("info", []).extend(
                        content["info"]
                    )
                if content.get("references") is not None:
                    content["references"] = form.get("references", []).extend(
                        content["references"]
                    )
                required_keys = form.get("required_keys", [])
            except StopIteration:
                pass
            return cls(
                content=update_content(
                    info.context,
                    content_obj,
                    content,
                    key=key,
                    required_keys=required_keys
                )
            )
        else:
            result = id_to_result(info.context, id, Cluster, "update")
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError()

            required_keys = []
            try:
                form = next(iter(result["forms"].keys()))
                if content.get("info") is not None:
                    content["info"] = form.get("info", []).extend(
                        content["info"]
                    )
                if content.get("references") is not None:
                    content["references"] = form.get("references", []).extend(
                        content["references"]
                    )
                required_keys = form.get("required_keys", [])
            except StopIteration:
                pass
            return cls(
                content=create_content(
                    info.context, content,
                    key=key,
                    required_keys=required_keys
                )
            )


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        value = graphene.Field(ContentValueInput, required=True)
        key = graphene.String(required=getattr(
            settings, "SECRETGRAPH_SERVERSIDE_ENCRYPTION", False
        ))
        references = graphene.List(ReferenceInput, required=False)

    content = graphene.Field(ContentNode)
    actionKey = graphene.String(required=False)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id, value, key, references):
        result = id_to_result(info.context, id, Content, "push")
        source = result["objects"].first()
        if not source:
            raise ValueError()
        form = result["forms"][source.actions.get(group="push").id]
        dataobj = dict(form)
        if references:
            dataobj["references"] = references.extend(
                dataobj.get("references") or []
            )
        dataobj["value"] = value
        required_keys = form.get("required_keys", [])
        action_key = None
        if form.pop("updateable", False):
            action_key = os.urandom(32)
            dataobj["actions"] = [{
                "key": action_key,
                "action": "update",
                "restrict": True,
                "form": form
            }]
        c = create_content(
            info.context, dataobj, key=key, required_keys=required_keys
        )
        return cls(content=c, actionKey=action_key)
