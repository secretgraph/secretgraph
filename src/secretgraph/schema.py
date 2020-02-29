import graphene

from .server.schema import ServerQuery
from .server.schema import ServerMutation


class Query(
    ServerQuery,  # Add your Query objects here
    graphene.ObjectType
):
    pass


class Mutation(
    ServerMutation,  # Add your Mutation objects here
    graphene.ObjectType
):
    pass


schema = graphene.Schema(query=Query, mutation=Mutation)
