from typing import Iterable, Optional

import strawberry
import strawberry_django

# from django.utils.translation import gettext_lazy as _
from strawberry.types import Info

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


@strawberry.type
class SecretgraphObject:
    # TODO: reinclude when fixed
    # node: Optional[strawberry.relay.Node] = strawberry.relay.node()
    @strawberry.field()
    @staticmethod
    def node(
        info, id: strawberry.relay.GlobalID
    ) -> Optional[strawberry.relay.Node]:
        return id.resolve_node(id.node_id, info=info, required=False)

    @strawberry_django.connection(strawberry.relay.ListConnection[ClusterNode])
    def clusters(
        self, info, filters: ClusterFilter = ClusterFilter()
    ) -> Iterable[ClusterNode]:
        return ClusterNode.get_queryset(
            Cluster.objects.all(),
            info,
            filters,
        )

    @strawberry_django.connection(strawberry.relay.ListConnection[ContentNode])
    def contents(
        self, info, filters: ContentFilter = ContentFilter()
    ) -> Iterable[ContentNode]:
        return ContentNode.get_queryset(
            Content.objects.all(),
            info=info,
            filters=filters,
        )

    @strawberry.field
    @staticmethod
    def config() -> SecretgraphConfig:
        return SecretgraphConfig(stub="1")

    permissions: list[str] = strawberry.field(resolver=get_permissions)
    activeUser: Optional[str] = strawberry.field(resolver=active_user)


@strawberry.type
class SecretgraphMutations:
    updateOrCreateContent: ContentMutation = strawberry_django.input_mutation(
        resolver=mutate_content,
        description=(
            "Supports creation or update of:\n"
            "  public key or key-pair (key): used for further encryption.\n"
            "  content (value): a content encrypted by public key except "
            "public"
        ),
        handle_django_errors=False,
    )
    updateOrCreateCluster: ClusterMutation = strawberry_django.input_mutation(
        resolver=mutate_cluster,
        description=(
            "Create a cluster, optionally initialize with a key-(pair)"
        ),
        handle_django_errors=False,
    )

    deleteContentOrCluster: DeleteContentOrClusterMutation = (
        strawberry_django.input_mutation(
            resolver=delete_content_or_cluster, handle_django_errors=False
        )
    )
    resetDeletionContentOrCluster: ResetDeletionContentOrClusterMutation = (
        strawberry_django.input_mutation(
            resolver=reset_deletion_content_or_cluster,
            handle_django_errors=False,
        )
    )
    regenerateFlexid: RegenerateFlexidMutation = (
        strawberry_django.input_mutation(
            resolver=regenerate_flexid, handle_django_errors=False
        )
    )
    updateMetadata: MetadataUpdateMutation = strawberry_django.input_mutation(
        resolver=update_metadata, handle_django_errors=False
    )
    updateMarks: MarkMutation = strawberry_django.input_mutation(
        resolver=mark, handle_django_errors=False
    )
    pushContent: PushContentMutation = strawberry_django.input_mutation(
        resolver=mutate_push_content, handle_django_errors=False
    )

    transferContent: TransferMutation = strawberry_django.input_mutation(
        resolver=mutate_transfer, handle_django_errors=False
    )

    logoutUser = strawberry.mutation(resolver=logoutUser)


@strawberry.type
class SecretgraphSubscriptions:
    subscribeNodeUpdates: NodeUpdateSubscription = strawberry.subscription(
        resolver=subscribe_node_updates
    )


@strawberry.type
class Query:
    @strawberry_django.field
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


@strawberry.type
class Mutation:
    @strawberry.field
    @staticmethod
    def secretgraph() -> SecretgraphMutations:
        return SecretgraphMutations


@strawberry.type
class Subscription:
    @strawberry.field
    @staticmethod
    def secretgraph() -> SecretgraphSubscriptions:
        return SecretgraphSubscriptions
