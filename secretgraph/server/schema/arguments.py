import graphene
from graphene_django import DjangoObjectType

from .models import Action as DjangoAction


class ActionArg(DjangoObjectType):
    class Meta:
        model = DjangoAction
        fields = ['value', 'start', 'stop']

    # always required as actions must be checked and transformed by server
    key = graphene.String(required=True)
