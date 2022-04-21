import strawberry
from strawberry_django_plus import relay, gql

# from django.utils.translation import gettext_lazy as _
from strawberry.types import Info

from .arguments import AuthList
from ..utils.auth import get_cached_result
from .definitions import (
    Cluster,
    Content,
    SecretgraphConfig,
)
from .mutations import (
    ClusterMutation,
    ContentMutation,
    DeleteContentOrClusterMutation,
    MetadataUpdateMutation,
    PushContentMutation,
    RegenerateFlexidMutation,
    ResetDeletionContentOrClusterMutation,
    MarkMutation,
)


@strawberry.type
class SecretgraphObject:
    node: relay.Node = relay.node()
    config: SecretgraphConfig
    clusters: relay.Connection[Cluster]
    contents: relay.Connection[Content]


@strawberry.type
class Query:
    @strawberry.field
    @staticmethod
    def secretgraph(info: Info, authorization: AuthList) -> SecretgraphObject:
        get_cached_result(info.context, authset=authorization)
        return SecretgraphObject()


@strawberry.type
class Mutation:
    updateOrCreateContent: ContentMutation = gql.django.input_mutation(
        ContentMutation.mutate_and_get_payload,
        description=(
            "Supports creation or update of:\n"
            "  public key or key-pair (key): used for further encryption.\n"
            "  content (value): a content encrypted by public key except "
            "public"
        ),
    )
    updateOrCreateCluster: ClusterMutation = gql.django.input_mutation(
        ClusterMutation.mutate_and_get_payload,
        description=(
            "Create a cluster, optionally initialize with a key-(pair)"
        ),
    )

    (ClusterMutation.mutate_and_get_payload)
    deleteContentOrCluster: DeleteContentOrClusterMutation = (
        DeleteContentOrClusterMutation.mutate_and_get_payload
    )
    resetDeletionContentOrCluster: ResetDeletionContentOrClusterMutation = (
        ResetDeletionContentOrClusterMutation.mutate_and_get_payload
    )
    regenerateFlexid: RegenerateFlexidMutation = gql.django.input_mutation(
        RegenerateFlexidMutation.mutate_and_get_payload
    )
    updateMetadata: MetadataUpdateMutation = gql.django.input_mutation(
        MetadataUpdateMutation.mutate_and_get_payload
    )
    updateMarks: MarkMutation = gql.django.input_mutation(
        MarkMutation.mutate_and_get_payload
    )
    pushContent: PushContentMutation = gql.django.input_mutation(
        PushContentMutation.mutate_and_get_payload
    )
