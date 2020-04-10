import graphene
from graphene import relay


from .server.schema import Query as ServerQuery
from .server.schema import Mutation as ServerMutation


class Query(
    ServerQuery,
    graphene.ObjectType
):
    node = relay.Node.Field()
    pass


class Mutation(
    ServerMutation,
    graphene.ObjectType
):
    pass


schema = graphene.Schema(query=Query, mutation=Mutation)
