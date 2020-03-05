import graphene

from .server.schema import Query as ServerQuery
from .server.schema import Mutation as ServerMutation


class Query(
    ServerQuery,
    graphene.ObjectType
):
    pass


class Mutation(
    ServerMutation,
    graphene.ObjectType
):
    pass


schema = graphene.Schema(query=Query, mutation=Mutation)
