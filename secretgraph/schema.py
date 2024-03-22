from typing import Optional

import strawberry
from django.conf import settings
from graphene_protector.django.strawberry import Schema
from strawberry.extensions import MaxTokensLimiter
from strawberry.schema.config import StrawberryConfig

from .server.schema import Mutation as ServerMutation
from .server.schema import Query as ServerQuery
from .server.schema import Subscription as ServerSubscription
from .server.schema.definitions import (
    ContentDownloadNode,
    ContentNode,
    NetNode,
)
from .server.strawberry_extensions import RatelimitErrors, RatelimitMutations

# from .user.schema import Query as UserQuery
# from .user.schema import Mutation as UserMutation


@strawberry.type
class Query(ServerQuery):
    node: Optional[strawberry.relay.Node] = strawberry.relay.node()
    nodes: list[Optional[strawberry.relay.Node]] = strawberry.relay.node()


@strawberry.type
class Mutation(ServerMutation):
    pass


schema = Schema(
    query=Query,
    mutation=Mutation,
    subscription=ServerSubscription,
    extensions=[MaxTokensLimiter(1000), RatelimitMutations, RatelimitErrors],
    # register ContentNode first
    types=[NetNode, ContentNode, ContentDownloadNode],
    config=StrawberryConfig(
        relay_max_results=settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS,
    ),
)
