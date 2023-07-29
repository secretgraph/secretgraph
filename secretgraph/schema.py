from typing import Optional

import strawberry
from django.conf import settings
from graphene_protector.django.strawberry import Schema
from strawberry.schema.config import StrawberryConfig

from .server.schema import Mutation as ServerMutation
from .server.schema import Query as ServerQuery
from .server.schema import Subscription as ServerSubscription
from .server.schema.definitions import NetNode
from .server.strawberry_extensions import RatelimitErrors, RatelimitMutations

# from .user.schema import Query as UserQuery
# from .user.schema import Mutation as UserMutation


@strawberry.type
class Query(ServerQuery):
    node: Optional[strawberry.relay.Node] = strawberry.relay.node()


@strawberry.type
class Mutation(ServerMutation):
    pass


schema = Schema(
    query=Query,
    mutation=Mutation,
    subscription=ServerSubscription,
    extensions=[RatelimitMutations, RatelimitErrors],
    types=[NetNode],
    config=StrawberryConfig(
        relay_max_results=settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS,
    ),
)
