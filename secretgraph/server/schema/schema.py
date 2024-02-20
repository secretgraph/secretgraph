from typing import Iterable, Optional

import strawberry
import strawberry_django

# from django.utils.translation import gettext_lazy as _
from strawberry.types import Info

from ..models import Cluster, Content
from ..utils.auth import aget_cached_net_properties, get_cached_result
from .arguments import AuthList
from .definitions import (
    ClusterFilter,
    ClusterNode,
    ContentFilter,
    ContentNode,
    Language,
    SecretgraphConfig,
    get_active_language,
    get_active_user,
    get_languages,
    get_permissions,
)
from .mutations import (
    ClusterMutation,
    ContentMutation,
    DeleteContentOrClusterMutation,
    MarkMutation,
    MetadataUpdateMutation,
    PullMutation,
    PushContentMutation,
    RegenerateFlexidMutation,
    ResetDeletionContentOrClusterMutation,
    TransferMutation,
    mutate_cluster,
    mutate_content,
    mutate_delete_content_or_cluster,
    mutate_logout_user,
    mutate_pull,
    mutate_push_content,
    mutate_regenerate_flexid,
    mutate_reset_deletion_content_or_cluster,
    mutate_transfer,
    mutate_update_mark,
    mutate_update_metadata,
)
from .subscriptions import NodeUpdateSubscription, subscribe_node_updates


@strawberry.type
class SecretgraphObject:
    node: Optional[strawberry.relay.Node] = strawberry.relay.node(default=None)
    nodes: list[Optional[strawberry.relay.Node]] = strawberry.relay.node(default=None)

    @strawberry_django.connection(strawberry.relay.ListConnection[ClusterNode])
    def clusters(
        self, info: Info, filters: ClusterFilter = ClusterFilter()
    ) -> Iterable[ClusterNode]:
        return ClusterNode.do_query(
            Cluster.objects.all(),
            info=info,
            filters=filters,
        )

    @strawberry_django.connection(strawberry.relay.ListConnection[ContentNode])
    def contents(
        self, info: Info, filters: ContentFilter = ContentFilter()
    ) -> Iterable[ContentNode]:
        return ContentNode.do_query(
            Content.objects.all(),
            info=info,
            filters=filters,
        )

    config: SecretgraphConfig = strawberry.field(default_factory=SecretgraphConfig)

    permissions: list[str] = strawberry.field(resolver=get_permissions)
    activeUser: Optional[str] = strawberry.field(resolver=get_active_user)
    languages: list[Language] = strawberry.field(resolver=get_languages)
    activeLanguage: Optional[Language] = strawberry.field(resolver=get_active_language)


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
        description=("Create a cluster, optionally initialize with a key-(pair)"),
        handle_django_errors=False,
    )

    deleteContentOrCluster: DeleteContentOrClusterMutation = (
        strawberry_django.input_mutation(
            resolver=mutate_delete_content_or_cluster,
            handle_django_errors=False,
        )
    )
    resetDeletionContentOrCluster: ResetDeletionContentOrClusterMutation = (
        strawberry_django.input_mutation(
            resolver=mutate_reset_deletion_content_or_cluster,
            handle_django_errors=False,
        )
    )
    regenerateFlexid: RegenerateFlexidMutation = strawberry_django.input_mutation(
        resolver=mutate_regenerate_flexid, handle_django_errors=False
    )
    updateMetadata: MetadataUpdateMutation = strawberry_django.input_mutation(
        resolver=mutate_update_metadata, handle_django_errors=False
    )
    updateMarks: MarkMutation = strawberry_django.input_mutation(
        resolver=mutate_update_mark, handle_django_errors=False
    )
    pushContent: PushContentMutation = strawberry_django.input_mutation(
        resolver=mutate_push_content, handle_django_errors=False
    )

    transferContent: TransferMutation = strawberry_django.input_mutation(
        resolver=mutate_transfer, handle_django_errors=False
    )

    pullContent: PullMutation = strawberry_django.input_mutation(
        resolver=mutate_pull, handle_django_errors=False
    )

    logoutUser = strawberry.mutation(resolver=mutate_logout_user)


@strawberry.type
class SecretgraphSubscriptions:
    subscribeNodeUpdates: NodeUpdateSubscription = strawberry.subscription(
        resolver=subscribe_node_updates
    )


@strawberry.type
class Query:
    @strawberry.field
    @staticmethod
    async def secretgraph(
        info: Info, authorization: Optional[AuthList] = None
    ) -> SecretgraphObject:
        await get_cached_result(info.context["request"], authset=authorization).preinit(
            "Content", "Cluster"
        )
        # f["Content"]
        # f["Cluster"]
        await aget_cached_net_properties(info.context["request"])
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
