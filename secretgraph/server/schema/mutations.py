import graphene
from django.conf import settings
from graphene import relay

from ..actions.update import (
    create_component, create_content, update_component, update_content
)
from ..models import (
    Component, Content
)
# , ReferenceContent
from ..signals import generateFlexid
from ..utils.auth import retrieve_allowed_objects
from .arguments import ComponentInput, ContentInput
from .definitions import ComponentNode, ContentNode, FlexidType

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
        if _type == "Component":
            objects = Component.objects.all()
        elif _type == "Content":
            objects = Content.objects.all()
        else:
            raise ValueError()
        objects = retrieve_allowed_objects(info, "update", objects)
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        obj = objects.get(flexid=flexid)
        generateFlexid(objects.model, obj, True)
        return cls(node=obj)


class ComponentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        component = ComponentInput(required=True)

    component = graphene.Field(ComponentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, component, id=None):
        if id:
            return cls(component=update_component(
                id, info.context
            ))
        else:
            user = None
            manage = retrieve_allowed_objects(
                info.context, "manage", Component.actions.all()
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
                raise ValueError("Cannot register new component clusters")
            elif getattr(
                settings, "SECRETGRAPH_ALLOW_REGISTER", False
            ) is not True:
                raise ValueError("Cannot register new components")

            return cls(
                component=create_component(component, info.context, user)
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
                    id,
                    content, info.context
                )
            )
        else:
            return cls(content=create_content(content, info.context))


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        content = graphene.Field(ContentInput, required=True)

    value = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, content_id, value):
        result = retrieve_allowed_objects(
            info, "push", Content.objects.all()
        )
        source = result["objects"].get(id=content_id)
        actions = \
            result["components"][source.component.flexid]["actions"].filter(
                content_action__content=source
            ).prefetch_selected("content_action")

        extras = {}
        for action in actions:
            extras.update(result["action_extras"].get(action.id, []))
        raise NotImplementedError
