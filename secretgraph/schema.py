import graphene
from graphene import relay


from .server.schema import Query as ServerQuery
from .server.schema import Mutation as ServerMutation


class SecretgraphQuery(
    ServerQuery,
    graphene.ObjectType
):
    node = relay.Node.Field()
    pass


class SecretgraphMutation(
    ServerMutation,
    graphene.ObjectType
):
    pass


schema = graphene.Schema(query=SecretgraphQuery, mutation=SecretgraphMutation)
