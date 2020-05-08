from datetime import timedelta as td

import graphene
from django.db.models import Q
from django.conf import settings
from django.utils import timezone
from graphene import relay

from ..actions.update import (
    create_cluster, create_content, update_cluster, update_content
)
from ..models import Cluster, Content
from ..signals import generateFlexid
from ..utils.auth import retrieve_allowed_objects
from .arguments import ClusterInput, ContentInput, ContentValueInput
from .definitions import ClusterNode, ContentNode, FlexidType

_serverside_encryption = getattr(
    settings, "SECRETGRAPH_SERVERSIDE_ENCRYPTION", False
)


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
        key = graphene.String(required=_serverside_encryption)

    content = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, content, id=None, key=None
    ):
        if id:
            return cls(
                content=update_content(
                    info.context,
                    id,
                    content,
                    key
                )
            )
        else:
            return cls(
                content=create_content(
                    info.context, content, key
                )
            )


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        value = graphene.Field(ContentValueInput, required=True)

    value = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, content_id, value):
        result = retrieve_allowed_objects(
            info, "push", Content.objects.all()
        )
        source = result["objects"].get(id=content_id)
        actions = \
            result["clusters"][source.cluster.flexid]["actions"].filter(
                content_action__content=source
            ).prefetch_selected("content_action")

        extras = {}
        for action in actions:
            extras.update(result["action_extras"].get(action.id, []))
        raise NotImplementedError
