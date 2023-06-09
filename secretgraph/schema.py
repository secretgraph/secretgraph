import strawberry
from graphene_protector.django.strawberry import Schema
from strawberry import relay

from .server.schema import Mutation as ServerMutation
from .server.schema import Query as ServerQuery
from .server.schema import Subscription as ServerSubscription
from .server.strawberry_extensions import RatelimitErrors, RatelimitMutations

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
