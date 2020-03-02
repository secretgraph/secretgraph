from graphene import relay, ObjectType
from graphene_django import DjangoObjectType
from graphene_django.filter import DjangoFilterConnectionField

from .models import Action, Component, Content, ContentValue

"""
Actions are encrypted data

view: return public informations, and secret for view contents
push
manage
view_contents
delete_content: [ids...]
delete_self
"""


class ComponentNode(DjangoObjectType):
    class Meta:
        model = Component
        interfaces = (relay.Node,)

    def resolve_id(self, info):
        return self.flexid

    @classmethod
    def get_node(cls, info, id):
        queryset = cls.get_queryset(cls._meta.model.objects, info)
        try:
            return queryset.get(flexid=id)
        except cls._meta.model.DoesNotExist:
            return None


class ContentNode(DjangoObjectType):
    class Meta:
        model = Content
        filter_fields = {
            'component': ['exact'],
            'values__name': ['exact', 'iexact'],
            'values__value': ['exact', 'iexact']
        }
        interfaces = (relay.Node,)


class ContentValueNode(DjangoObjectType):
    class Meta:
        model = ContentValue
        interfaces = (relay.Node,)


class ActionNode(DjangoObjectType):
    class Meta:
        model = Action
        filter_fields = ['keyhash']
        fields = []
        interfaces = (relay.Node,)


class Query():
    pass


class Mutation():
    pass
