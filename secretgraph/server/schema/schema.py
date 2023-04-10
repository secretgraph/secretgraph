from typing import Optional
from strawberry_django_plus import relay, gql

# from django.utils.translation import gettext_lazy as _
from strawberry.types import Info


from .arguments import AuthList
from ..utils.auth import get_cached_properties, get_cached_result
from ..models import Cluster, Content
from .definitions import (
    ClusterFilter,
    ClusterNode,
    ContentFilter,
    ContentNode,
    SecretgraphConfig,
    get_permissions,
    active_user,
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
    logoutUser,
)

from .subscriptions import subscribe_node_updates, NodeUpdateSubscription


@gql.type
class SecretgraphObject:
    node: Optional[relay.Node] = gql.django.node()

    @gql.django.connection()
    @gql.django.django_resolver
    def clusters(self, info, filters: ClusterFilter) -> list[ClusterNode]:
        return ClusterNode.get_queryset_intern(
            Cluster.objects.all(), info, filters
        )

    @gql.django.connection()
    @gql.django.django_resolver
    def contents(self, info, filters: ContentFilter) -> list[ContentNode]:
        return ContentNode.get_queryset_intern(
            Content.objects.all(), info, filters
        )

    @gql.field
    @staticmethod
    def config() -> SecretgraphConfig:
        return SecretgraphConfig()

    permissions: list[str] = gql.field(resolver=get_permissions)
    activeUser: Optional[str] = gql.field(resolver=active_user)


@gql.type
class SecretgraphMutations:
    updateOrCreateContent: ContentMutation = gql.django.input_mutation(
        resolver=mutate_content,
        description=(
            "Supports creation or update of:\n"
            "  public key or key-pair (key): used for further encryption.\n"
            "  content (value): a content encrypted by public key except "
            "public"
        ),
        handle_django_errors=False,
    )
    updateOrCreateCluster: ClusterMutation = gql.django.input_mutation(
        resolver=mutate_cluster,
        description=(
            "Create a cluster, optionally initialize with a key-(pair)"
        ),
        handle_django_errors=False,
    )

    deleteContentOrCluster: DeleteContentOrClusterMutation = (
        gql.django.input_mutation(
            resolver=delete_content_or_cluster, handle_django_errors=False
        )
    )
    resetDeletionContentOrCluster: ResetDeletionContentOrClusterMutation = (
        gql.django.input_mutation(
            resolver=reset_deletion_content_or_cluster,
            handle_django_errors=False,
        )
    )
    regenerateFlexid: RegenerateFlexidMutation = gql.django.input_mutation(
        resolver=regenerate_flexid, handle_django_errors=False
    )
    updateMetadata: MetadataUpdateMutation = gql.django.input_mutation(
        resolver=update_metadata, handle_django_errors=False
    )
    updateMarks: MarkMutation = gql.django.input_mutation(
        resolver=mark, handle_django_errors=False
    )
    pushContent: PushContentMutation = gql.django.input_mutation(
        resolver=mutate_push_content, handle_django_errors=False
    )

    transferContent: TransferMutation = gql.django.input_mutation(
        resolver=mutate_transfer, handle_django_errors=False
    )

    logoutUser: None = gql.mutation(resolver=logoutUser)


@gql.type
class SecretgraphSubscriptions:
    subscribeNodeUpdates: NodeUpdateSubscription = gql.subscription(
        resolver=subscribe_node_updates
    )


@gql.type
class Query:
    @gql.field
    @gql.django.django_resolver
    @staticmethod
    def secretgraph(
        info: Info, authorization: Optional[AuthList] = None
    ) -> SecretgraphObject:
        get_cached_result(
            info.context["request"], authset=authorization
        ).preinit("Content", "Cluster")
        # f["Content"]
        # f["Cluster"]
        get_cached_properties(info.context["request"])
        return SecretgraphObject


@gql.type
class Mutation:
    @gql.field
    @staticmethod
    def secretgraph() -> SecretgraphMutations:
        return SecretgraphMutations


@gql.type
class Subscription:
    @gql.field
    @staticmethod
    def secretgraph() -> SecretgraphSubscriptions:
        return SecretgraphSubscriptions
