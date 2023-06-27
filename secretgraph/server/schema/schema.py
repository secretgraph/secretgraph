from typing import Iterable, Optional

# from django.utils.translation import gettext_lazy as _
from strawberry.types import Info
from strawberry_django_plus import gql

from ..models import Cluster, Content
from ..utils.auth import get_cached_net_properties, get_cached_result
from .arguments import AuthList
from .definitions import (
    ClusterFilter,
    ClusterNode,
    ContentFilter,
    ContentNode,
    SecretgraphConfig,
    active_user,
    get_permissions,
)
from .mutations import (
    ClusterMutation,
    ContentMutation,
    DeleteContentOrClusterMutation,
    MarkMutation,
    MetadataUpdateMutation,
    PushContentMutation,
    RegenerateFlexidMutation,
    ResetDeletionContentOrClusterMutation,
    TransferMutation,
    delete_content_or_cluster,
    logoutUser,
    mark,
    mutate_cluster,
    mutate_content,
    mutate_push_content,
    mutate_transfer,
    regenerate_flexid,
    reset_deletion_content_or_cluster,
    update_metadata,
)
from .subscriptions import NodeUpdateSubscription, subscribe_node_updates


@gql.type
class SecretgraphObject:
    node: gql.relay.Node = gql.relay.node()

    @gql.relay.connection(gql.relay.ListConnection[ClusterNode])
    @gql.django.django_resolver
    def clusters(
        self, info, filters: ClusterFilter = ClusterFilter()
    ) -> Iterable[ClusterNode]:
        return ClusterNode.get_queryset(
            Cluster.objects.all(),
            info,
            filters,
        )

    @gql.relay.connection(gql.relay.ListConnection[ClusterNode])
    @gql.django.django_resolver
    def contents(
        self, info, filters: ContentFilter = ContentFilter()
    ) -> Iterable[ContentNode]:
        return ContentNode.get_queryset(
            Content.objects.all(),
            info=info,
            filters=filters,
        )

    @gql.field
    @staticmethod
    def config() -> SecretgraphConfig:
        return SecretgraphConfig(stub="1")

    permissions: list[str] = gql.field(resolver=get_permissions)
    activeUser: Optional[str] = gql.field(
        resolver=gql.django.django_resolver(active_user)
    )


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

    logoutUser = gql.mutation(resolver=logoutUser)


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
        get_cached_net_properties(info.context["request"])
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
