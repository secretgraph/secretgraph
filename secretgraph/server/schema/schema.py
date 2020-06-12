
import graphene
from graphene import relay

from ..actions.view import fetch_clusters, fetch_contents
from .definitions import (
    ContentConnectionField, ClusterNode, ClusterConnectionField, ContentNode,
    SecretgraphConfig
)
from .mutations import (
    ClusterMutation, ContentMutation,
    ResetDeletionContentOrClusterMutation,
    DeleteContentOrClusterMutation,
    PushContentMutation,
    RegenerateFlexidMutation
)


class Query():
    secretgraphConfig = graphene.Field(SecretgraphConfig)
    cluster = relay.Node.Field(ClusterNode)
    clusters = ClusterConnectionField()

    content = relay.Node.Field(ContentNode)
    contents = ContentConnectionField()

    def resolve_secretgraphConfig(self, info, **kwargs):
        return SecretgraphConfig()

    def resolve_cluster(
        self, info, id, **kwargs
    ):
        return fetch_clusters(
            info.context, query=str(id)
        )["objects"].first()

    def resolve_content(self, info, id, **kwargs):
        return fetch_contents(
            info.context, query=str(id)
        )["objects"].first()


class Mutation():
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
