import strawberry
from strawberry import relay

from graphene_protector.django.strawberry import Schema

from .server.schema import (
    Query as ServerQuery,
    Mutation as ServerMutation,
    Subscription as ServerSubscription,
)
from .server.strawberry_extensions import (
    RatelimitMutations,
    RatelimitErrors,
)

# from .user.schema import Query as UserQuery
# from .user.schema import Mutation as UserMutation


@strawberry.type
class Query(ServerQuery):
    node: relay.Node = relay.node()


@strawberry.type
class Mutation(ServerMutation):
    pass


schema = Schema(
    query=Query,
    mutation=Mutation,
    subscription=ServerSubscription,
    extensions=[RatelimitMutations, RatelimitErrors],
)
