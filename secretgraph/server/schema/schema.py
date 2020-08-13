
from graphene import Field

from .arguments import AuthList, AuthRelayField
from .definitions import (
    ClusterConnectionField, ClusterNode, ContentConnectionField, ContentNode,
    SecretgraphConfig
)
from .mutations import (
    ClusterMutation, ContentMutation, DeleteContentOrClusterMutation,
    MetadataUpdateMutation, PushContentMutation, RegenerateFlexidMutation,
    ResetDeletionContentOrClusterMutation
)


class Query():
    secretgraphConfig = Field(SecretgraphConfig)
    cluster = AuthRelayField(ClusterNode)
    clusters = ClusterConnectionField(authorization=AuthList())

    content = AuthRelayField(ContentNode)
    contents = ContentConnectionField(authorization=AuthList())

    def resolve_secretgraphConfig(self, info, **kwargs):
        return SecretgraphConfig()

    def resolve_cluster(
        self, info, **kwargs
    ):
        return ClusterNode.get_node(info, **kwargs)

    def resolve_content(self, info, **kwargs):
        return ContentNode.get_node(info, **kwargs)


class Mutation():
    updateOrCreateContent = ContentMutation.Field(
        description="""
        """
    )
    updateOrCreateCluster = ClusterMutation.Field()
    updateMetadata = MetadataUpdateMutation.Field()
    pushContent = PushContentMutation.Field()
    regenerateFlexid = RegenerateFlexidMutation.Field()
    deleteContentOrCluster = DeleteContentOrClusterMutation.Field()
    resetDeletionContentOrCluster = \
        ResetDeletionContentOrClusterMutation.Field()
