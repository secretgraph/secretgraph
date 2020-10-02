
from graphene import Field, List, ID
from django.utils.translation import gettext_lazy as _


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
    clusters = ClusterConnectionField(
        authorization=AuthList()
    )

    content = AuthRelayField(ContentNode)
    contents = ContentConnectionField(
        authorization=AuthList(),
        clusters=List(
            ID, required=False
        )
    )

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
        description=_(
            "Supports creation or update of:\n"
            "  public key or key-pair (key): used for further encryption.\n"
            "  content (value): a content encrypted by public key"
        )
    )
    updateOrCreateCluster = ClusterMutation.Field(
        description=_(
            "Create a cluster, optionally initialize with a key-(pair)"
        )
    )
    updateMetadata = MetadataUpdateMutation.Field()
    pushContent = PushContentMutation.Field()
    regenerateFlexid = RegenerateFlexidMutation.Field()
    deleteContentOrCluster = DeleteContentOrClusterMutation.Field()
    resetDeletionContentOrCluster = \
        ResetDeletionContentOrClusterMutation.Field()
