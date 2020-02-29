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


class ActionNode(DjangoObjectType):
    class Meta:
        model = Action
        filter_fields = ['keyhash']
        fields = []
        interfaces = (relay.Node,)


class ComponentNode(DjangoObjectType):
    class Meta:
        model = Component
        interfaces = (relay.Node,)


class ContentNode(DjangoObjectType):
    class Meta:
        model = Content
        filter_fields = {
            'component': ['exact'],
            'values__name': ['exact', 'iexact'],
            'values__value': ['exact', 'iexact']
        }
        interfaces = (relay.Node,)


class ComponentValueNode(DjangoObjectType):
    class Meta:
        model = ContentValue
        interfaces = (relay.Node,)


class Query():
    pass


class Mutation():
    pass
