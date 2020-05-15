
import graphene
from django.db.models import Q
from graphene import relay

from ..actions.view import fetch_clusters, fetch_contents
from ..models import Cluster
from .definitions import (
    ClusterConnection, ClusterNode, ContentConnection, ContentNode,
    SecretgraphConfig
)
from .mutations import (
    ClusterMutation, ContentMutation,
    ResetDeletionContentOrClusterMutation,
    DeleteContentOrClusterMutation,
    PushContentMutation,
    RegenerateFlexidMutation
)


class Query():
    secretgraphConfig = graphene.Field(SecretgraphConfig)
    cluster = relay.Node.Field(ClusterNode)
    clusters = relay.ConnectionField(ClusterConnection)
    allClusters = relay.ConnectionField(ClusterConnection)

    content = relay.Node.Field(ContentNode)
    contents = relay.ConnectionField(ContentConnection)

    def resolve_secretgraphConfig(self, info, **kwargs):
        return SecretgraphConfig()

    def resolve_cluster(
        self, info, id, **kwargs
    ):
        return fetch_clusters(
            info.context, query=id
        )["object"]

    def resolve_all_clusters(
        self, info, user=None, **kwargs
    ):
        incl_filters = Q()
        for i in kwargs.get("info_include") or []:
            incl_filters |= Q(info__tag__startswith=i)

        excl_filters = Q()
        for i in kwargs.get("info_exclude") or []:
            excl_filters |= Q(info__tag__startswith=i)
        clusters = Cluster.objects.filter(
            ~excl_filters & incl_filters
        )
        if user:
            clusters = clusters.filter(user__username=user)
        if not info.context.user.is_staff:
            clusters = clusters.filter(public=True)
        return clusters

    def resolve_clusters(
        self, info, **kwargs
    ):
        return fetch_clusters(
            info.context,
            info_include=kwargs.get("info_include"),
            info_exclude=kwargs.get("info_exclude")
        )["objects"]

    def resolve_content(self, info, id, **kwargs):
        return fetch_contents(
            info.context, query=id
        )["object"]

    def resolve_contents(self, info, **kwargs):
        return fetch_contents(
            info.context,
            info_include=kwargs.get("info_include"),
            info_exclude=kwargs.get("info_exclude")
        )["objects"]


class Mutation():
    updateOrCreateContent = ContentMutation.Field()
    updateOrCreateCluster = ClusterMutation.Field()
    pushContent = PushContentMutation.Field()
    regenerateFlexid = RegenerateFlexidMutation.Field()
    deleteContentOrCluster = DeleteContentOrClusterMutation.Field()
    resetDeletionContentOrCluster = \
        ResetDeletionContentOrClusterMutation.Field()
