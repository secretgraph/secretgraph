import strawberry
from typing import Optional, List
from strawberry_django_plus import relay, gql

# from django.utils.translation import gettext_lazy as _
from strawberry.types import Info


from .arguments import AuthList
from ..utils.auth import get_cached_result
from .definitions import (
    ClusterFilter,
    ClusterNode,
    ContentFilter,
    ContentNode,
    SecretgraphConfig,
)
from .mutations import (
    ClusterMutation,
    mutate_cluster,
    delete_content_or_cluster,
    reset_deletion_content_or_cluster,
    ContentMutation,
    mutate_content,
    mutate_push_content,
    mutate_transfer,
    regenerate_flexid,
    update_metadata,
    mark,
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

    @gql.django.connection()
    @gql.django.django_resolver
    def clusters(
        self, info: Info, filters: ClusterFilter
    ) -> List[ClusterNode]:
        return ClusterNode.get_queryset_intern(info, filters)

    @gql.django.connection()
    @gql.django.django_resolver
    def contents(
        self, info: Info, filters: ContentFilter
    ) -> List[ContentNode]:
        return ContentNode.get_queryset_intern(info, filters)

    config: SecretgraphConfig = strawberry.field(default=SecretgraphConfig())


@gql.type
class Query:
    @strawberry.field
    @gql.django.django_resolver
    @staticmethod
    def secretgraph(
        info: Info, authorization: Optional[AuthList] = None
    ) -> SecretgraphObject:
        f = get_cached_result(info.context.request, authset=authorization)
        f["Content"]
        f["Cluster"]
        return SecretgraphObject


@gql.type
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
        gql.django.input_mutation(delete_content_or_cluster)
    )
    resetDeletionContentOrCluster: ResetDeletionContentOrClusterMutation = (
        gql.django.input_mutation(reset_deletion_content_or_cluster)
    )
    regenerateFlexid: RegenerateFlexidMutation = gql.django.input_mutation(
        regenerate_flexid
    )
    updateMetadata: MetadataUpdateMutation = gql.django.input_mutation(
        update_metadata
    )
    updateMarks: MarkMutation = gql.django.input_mutation(mark)
    pushContent: PushContentMutation = gql.django.input_mutation(
        mutate_push_content
    )

    transferContent: TransferMutation = gql.django.input_mutation(
        mutate_transfer
    )
