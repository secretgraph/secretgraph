
from graphene import relay, Field

from ...utils.auth import initializeCachedResult
from ..actions.view import fetch_clusters, fetch_contents
from .arguments import AuthList
from .definitions import (
    ClusterConnectionField, ClusterNode, ContentConnectionField, ContentNode,
    SecretgraphConfig
)
from .mutations import (
    ClusterMutation, ContentMutation,
    DeleteContentOrClusterMutation, PushContentMutation,
    RegenerateFlexidMutation, ResetDeletionContentOrClusterMutation
)


class Query():
    secretgraphConfig = Field(SecretgraphConfig)
    cluster = relay.Node.Field(ClusterNode, authorization=AuthList())
    clusters = ClusterConnectionField(authorization=AuthList())

    content = relay.Node.Field(ContentNode, authorization=AuthList())
    contents = ContentConnectionField(authorization=AuthList())

    def resolve_secretgraphConfig(self, info, **kwargs):
        return SecretgraphConfig()

    def resolve_cluster(
        self, info, id, authorization=None, **kwargs
    ):
        return fetch_clusters(
            initializeCachedResult(
                info.context, authset=authorization
            )["Cluster"]["objects"],
            str(id)
        ).first()

    def resolve_content(self, info, id, authorization=None, **kwargs):
        result = initializeCachedResult(
            info.context, authset=authorization
        )["Content"]
        return fetch_contents(
            result["objects"], result["actions"], str(id)
        ).first()


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
