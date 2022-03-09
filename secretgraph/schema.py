import graphene
from graphene import relay
from graphene_protector.django.graphene import Schema

from .server.schema import Query as ServerQuery
from .server.schema import Mutation as ServerMutation
from .user.schema import Query as UserQuery
from .user.schema import Mutation as UserMutation


class Query(ServerQuery, UserQuery, graphene.ObjectType):
    node = relay.Node.Field()


class Mutation(ServerMutation, UserMutation, graphene.ObjectType):
    pass


schema = Schema(query=Query, mutation=Mutation)
