
import graphene
from graphene import relay

from ...utils import initializeCachedResult
from ..actions.view import fetch_clusters, fetch_contents
from .arguments import AuthList
from .definitions import (
    ClusterConnectionField, ClusterNode, ContentConnectionField, ContentNode,
    SecretgraphConfig
)
from .mutations import (
    AuthorizationMutation, ClusterMutation, ContentMutation,
    DeleteContentOrClusterMutation, PushContentMutation,
    RegenerateFlexidMutation, ResetDeletionContentOrClusterMutation
)


class Query():
    secretgraphConfig = graphene.Field(SecretgraphConfig)
    cluster = relay.Node.Field(ClusterNode, authorization=AuthList())
    clusters = ClusterConnectionField(authorization=AuthList())

    content = relay.Node.Field(ContentNode, authorization=AuthList())
    contents = ContentConnectionField(authorization=AuthList())

    def resolve_secretgraphConfig(self, info, **kwargs):
        return SecretgraphConfig()

    def resolve_cluster(
        self, info, id, authorization=None, **kwargs
    ):
        result = fetch_clusters(
            info.context,
            query=str(id),
            authset=authorization
        )
        initializeCachedResult(info.context, authset=authorization)
        return result["objects"].first()

    def resolve_content(self, info, id, authorization=None, **kwargs):
        result = fetch_contents(
            info.context,
            query=str(id),
            authset=authorization
        )
        initializeCachedResult(info.context, authset=authorization)
        return result["objects"].first()


class Mutation():
    secretgraphAuth = AuthorizationMutation.Field()
    updateOrCreateContent = ContentMutation.Field(
        description="""
        """
    )
    updateOrCreateCluster = ClusterMutation.Field()
    pushContent = PushContentMutation.Field()
    regenerateFlexid = RegenerateFlexidMutation.Field()
    deleteContentOrCluster = DeleteContentOrClusterMutation.Field()
    resetDeletionContentOrCluster = \
        ResetDeletionContentOrClusterMutation.Field()
