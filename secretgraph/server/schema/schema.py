import strawberry
from typing import Optional
from strawberry_django_plus import relay, gql

# from django.utils.translation import gettext_lazy as _
from strawberry.types import Info

from .arguments import AuthList
from ..utils.auth import get_cached_result
from .definitions import (
    ClusterNode,
    ContentNode,
    SecretgraphConfig,
)
from .mutations import (
    ClusterMutation,
    mutate_cluster,
    ContentMutation,
    mutate_content,
    mutate_push_content,
    mutate_transfer,
    TransferMutation,
    DeleteContentOrClusterMutation,
    MetadataUpdateMutation,
    PushContentMutation,
    RegenerateFlexidMutation,
    ResetDeletionContentOrClusterMutation,
    MarkMutation,
)


@strawberry.type
class SecretgraphObject:
    node: Optional[relay.Node] = gql.django.node()
    clusters: relay.Connection[ClusterNode] = gql.django.connection()
    contents: relay.Connection[ContentNode] = gql.django.connection()
    config: SecretgraphConfig = strawberry.field(default=SecretgraphConfig())


@strawberry.type
class Query:
    @strawberry.field
    @staticmethod
    def secretgraph(
        info: Info, authorization: Optional[AuthList] = None
    ) -> SecretgraphObject:
        get_cached_result(info.context.request, authset=authorization)
        return SecretgraphObject


@strawberry.type
class Mutation:
    updateOrCreateContent: ContentMutation = gql.django.input_mutation(
        mutate_content,
        description=(
            "Supports creation or update of:\n"
            "  public key or key-pair (key): used for further encryption.\n"
            "  content (value): a content encrypted by public key except "
            "public"
        ),
    )
    updateOrCreateCluster: ClusterMutation = gql.django.input_mutation(
        mutate_cluster,
        description=(
            "Create a cluster, optionally initialize with a key-(pair)"
        ),
    )

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
        mutate_push_content
    )

    transferContent: TransferMutation = gql.django.input_mutation(
        mutate_transfer
    )
