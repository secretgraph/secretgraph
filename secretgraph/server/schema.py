
import graphene
from django.conf import settings
from graphene import relay
from graphene_django import DjangoObjectType
from graphene_django.filter import DjangoFilterConnectionField
from rdflib import Graph

from .models import Component, Content, ContentValue, ReferenceContent
from .utils import retrieve_allowed_objects


class ContentNode(DjangoObjectType):
    class Meta:
        model = Content
        filter_fields = {
            'component': ['exact'],
            'values__name': ['exact', 'startswith'],
            'values__value': ['exact', 'startswith'],
            'references__name': ['exact', 'startswith']
        }
        interfaces = (relay.Node,)
        fields = [
            'nonce', 'component', 'values', 'references', 'referenced_by'
        ]


class ReferenceContentNode(DjangoObjectType):
    class Meta:
        model = ReferenceContent
        interfaces = (relay.Node,)
        fields = ['source', 'target', 'name', 'delete_recursive']


class ComponentNode(DjangoObjectType):

    # exposed id is flexid
    class Meta:
        model = Component
        interfaces = (relay.Node,)
        fields = ['public_info']
        filter_fields = {}
        if (
            getattr(settings, "AUTH_USER_MODEL", None) or
            getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
        ):
            fields.append("user")
            filter_fields["user"] = ["exact"]

    def resolve_id(self, info):
        return self.flexid

    @classmethod
    def get_node(cls, info, id):
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            return queryset.get(flexid=id)
        except cls._meta.model.DoesNotExist:
            return None


class ContentValueNode(DjangoObjectType):
    class Meta:
        model = ContentValue
        interfaces = (relay.Node,)
        fields = ['content', 'updated', 'value', 'file']


"""

class UploadFile(graphene.ClientIDMutation):
    class Input:
        pass
        # nothing needed for uploading file

    # your return fields
    success = graphene.String()

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        # When using it in Django, context will be the request
        files = info.context.FILES
        # Or, if used in Flask, context will be the flask global request
        # files = context.files

        # do something with files

        return UploadFile(success=True)
"""


class ComponentMutation(relay.ClientIDMutation):
    class Input:
        public_info = graphene.String(required=True)
        id = graphene.ID()
        user = graphene.ID()

    component = graphene.Field(ComponentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, public_info, id, user=None):
        idpart = cls.from_global_id(id)[1]
        g = Graph()
        g.parse(public_info, "turtle")
        if idpart:
            component = retrieve_allowed_objects(
                info, "manage", Component.objects.all()
            ).get(flexid=idpart)
            component.public_info = public_info
            component.save(update_fields=["public_info"])
        else:
            prebuild = {
                "public_info": public_info
            }
            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if not info.context.user.is_authenticated:
                    raise
                prebuild["user"] = info.context.user
            # TODO: admin permission
            # if info.context.user.has_perm("TODO") and user:
            #     prebuild["user"] = cls.from_global_id(user)[1]
            component = Component.objects.create(**prebuild)
        # TODO: inject related
        return cls(component=component)


class RegenerateComponentIDMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    component = graphene.Field(ComponentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        components = Component.objects.all()
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        component = components.get(flexid=cls.from_global_id(id)[1])
        component.flexid = None
        component.save(update_fields=["flexid"])
        return cls(component=component)


class ContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID()
        component = graphene.ID()
        content = graphene.Field(ContentValueNode)

    value = graphene.Field(ContentValueNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        pass


class PushFileMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    value = graphene.Field(ContentValueNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        pass


class Query():
    component = relay.Node.Field(ComponentNode)
    all_components = DjangoFilterConnectionField(ComponentNode)

    content = relay.Node.Field(ContentNode)
    all_contents = DjangoFilterConnectionField(ContentNode)

    def resolve_all_components(self, info, **kwargs):
        if info.context.user.is_staff:
            return Component.objects.all()
        return Component.objects.none()

    def resolve_content(self, info, content_id):
        return retrieve_allowed_objects(
            info, "view", Content.objects.all()
        ).get(id=content_id)

    def resolve_all_contents(self, info, **kwargs):
        return retrieve_allowed_objects(
            info, "view", Content.objects.all()
        )


class Mutation():
    manage_component = ComponentMutation.Field()
    regenerate_flexid = RegenerateComponentIDMutation.Field()
