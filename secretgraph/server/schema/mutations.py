
import logging
from datetime import timedelta as td

import graphene
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from graphene import relay
from graphql_relay import from_global_id

from ..actions.update import (
    create_cluster, create_content, update_cluster, update_content,
    create_action_for_content
)
from ..models import Cluster, Content
from ..signals import generateFlexid
from ..utils.auth import retrieve_allowed_objects
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
        _type, flexid = cls.from_global_id(id)
        if _type == "Cluster":
            objects = Cluster.objects.all()
        elif _type == "Content":
            objects = Content.objects.all()
        else:
            raise ValueError()
        objects = retrieve_allowed_objects(info, "update", objects)["objects"]
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        obj = objects.get(flexid=flexid)
        generateFlexid(objects.model, obj, True)
        return cls(node=obj)


class DeleteMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        _type, flexid = cls.from_global_id(id)
        now = timezone.now()
        now_plus_x = now + td(minutes=20)
        # cleanup expired
        Content.objects.filter(
            mark_for_destruction__lte=now
        ).delete()
        if _type == "Cluster":
            objects = Cluster.objects.all()
            result = retrieve_allowed_objects(info, "delete", objects)
        elif _type == "Content":
            objects = Content.objects.all()
            result = retrieve_allowed_objects(info, "delete", objects)
        else:
            raise ValueError()
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        obj = result["objects"].get(flexid=flexid)
        ret = cls(node=obj)
        if _type == "Content":
            if (
                not obj.mark_for_destruction or
                obj.mark_for_destruction > now_plus_x
            ):
                obj.mark_for_destruction = now_plus_x
                obj.save(update_fields=["mark_for_destruction"])
        elif _type == "Component":
            if not obj.contents.exists():
                obj.delete()
            else:
                obj.contents.filter(
                    Q(mark_for_destruction__isnull=True) |
                    Q(mark_for_destruction__gt=now_plus_x)
                ).update(mark_for_destruction=now_plus_x)
        return ret


class ResetMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        _type, flexid = cls.from_global_id(id)
        if _type == "Cluster":
            objects = Cluster.objects.all()
            result = retrieve_allowed_objects(info, "manage", objects)
        elif _type == "Content":
            objects = Content.objects.all()
            result = retrieve_allowed_objects(info, "manage", objects)
        else:
            raise ValueError()
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    clusters = retrieve_allowed_objects(
        #        info, "manage", clusters
        #    )
        obj = result["objects"].get(flexid=flexid)
        ret = cls(node=obj)
        if _type == "Content":
            obj.mark_for_destruction = None
            obj.save(update_fields=["mark_for_destruction"])
        elif _type == "Cluster":
            obj.contents.filter(
                mark_for_destruction__isnull=False
            ).update(mark_for_destruction=None)
        return ret


class ClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        cluster = ClusterInput(required=True)
        key = graphene.String(required=False)

    cluster = graphene.Field(ClusterNode)
    action_key = graphene.String(required=False)
    private_key = graphene.String(required=False)
    key_for_private_key = graphene.String(required=False)

    @classmethod
    def mutate_and_get_payload(cls, root, info, cluster, id=None):
        if id:
            return cls(cluster=update_cluster(
                id, info.context
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
                    user = info.context.user
                if not user.is_authenticated:
                    raise ValueError("Must be logged in")
            elif (
                getattr(
                    settings, "SECRETGRAPH_ALLOW_REGISTER", False
                ) == "cluster" and
                not manage.exist()
            ):
                raise ValueError("Cannot register new cluster clusters")
            elif getattr(
                settings, "SECRETGRAPH_ALLOW_REGISTER", False
            ) is not True:
                raise ValueError("Cannot register new cluster")
            cluster, action_key, private_key, key_for_private_key = \
                create_cluster(info.context, cluster, user)
            return cls(
                cluster=cluster,
                action_key=action_key,
                private_key=private_key,
                key_for_private_key=key_for_private_key
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
            type_name, flexid = from_global_id(id)
            if type_name != "Content":
                raise ValueError("Only for Contents")
            result = retrieve_allowed_objects(
                info.context, "update", Content.objects.filter(flexid=flexid)
            )
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
            type_name, flexid = from_global_id(content.cluster)
            if type_name != "Cluster":
                raise ValueError("Requires Cluster type for cluster")

            result = retrieve_allowed_objects(
                info.context, "update", Cluster.objects.filter(flexid=flexid)
            )
            cluster_obj = result["objects"].first()
            if not cluster_obj:
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
    action_key = graphene.String(required=False)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id, value, key, references):
        type_name, flexid = from_global_id(id)
        if type_name != "Content":
            raise ValueError("Only for Contents")
        result = retrieve_allowed_objects(
            info.context, "push", Content.objects.filter(flexid=flexid)
        )
        source = result["objects"].first()
        if not source:
            raise ValueError()
        form = result["forms"][source.actions.get(group="push").id]
        content = dict(form)
        if references:
            content["references"] = references.extend(
                content.get("references") or []
            )
        content["value"] = value
        required_keys = form.get("required_keys", [])
        c = create_content(
            info.context, content, key=key, required_keys=required_keys
        )
        key = None
        if form.pop("updateable", False):
            try:
                key = create_action_for_content(
                    c,
                    {
                        "action": "update",
                        "restrict": True,
                        "form": form
                    },
                    info.context
                )
            except Exception as exc:
                logger.error("Creating action failed", exc_info=exc)
        return
