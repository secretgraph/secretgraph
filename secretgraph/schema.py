import strawberry
from strawberry_django_plus import relay

# from graphene_protector.django.strawberry import Schema

from .server.schema import (
    Query as ServerQuery,
    Mutation as ServerMutation,
    Subscription as ServerSubscription,
)

# from .user.schema import Query as UserQuery
# from .user.schema import Mutation as UserMutation


@strawberry.type
class Query(ServerQuery):
    node: relay.Node = relay.node()


@strawberry.type
class Mutation(ServerMutation):
    pass


schema = strawberry.Schema(
    query=Query, mutation=Mutation, subscription=ServerSubscription
)
