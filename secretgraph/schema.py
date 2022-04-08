import strawberry
from strawberry_django_plus.relay import node
from graphene_protector.django.strawberry import Schema

from .server.schema import Query as ServerQuery
from .server.schema import Mutation as ServerMutation
from .user.schema import Query as UserQuery
from .user.schema import Mutation as UserMutation


@strawberry.type
class Query(ServerQuery, UserQuery):
    node = node()


@strawberry.type
class Mutation(ServerMutation, UserMutation):
    pass


schema = Schema(query=Query, mutation=Mutation)
