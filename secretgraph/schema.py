import graphene
from graphene import relay


from .server.schema import Query as ServerQuery
from .server.schema import Mutation as ServerMutation
from .user.schema import Query as UserQuery
from .user.schema import Mutation as UserMutation


class SecretgraphQuery(
    ServerQuery,
    UserQuery,
    graphene.ObjectType
):
    node = relay.Node.Field()
    pass


class SecretgraphMutation(
    ServerMutation,
    UserMutation,
    graphene.ObjectType
):
    pass


schema = graphene.Schema(query=SecretgraphQuery, mutation=SecretgraphMutation)
