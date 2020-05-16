
import graphene
from django.conf import settings
from django.db.models import Q
from graphene import relay
from graphql_relay import from_global_id

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

    def resolve_clusters(
        self, info, public=False, featured=False, user=None, **kwargs
    ):
        clusters = Cluster.objects.all()
        if user:
            if (
                not getattr(settings, "AUTH_USER_MODEL", None) and
                not getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
            ):
                raise ValueError("Users are not supported")
            try:
                user = from_global_id(user)[1]
            except Exception:
                pass
            clusters = clusters.filter(user__pk=user)
        if public:
            incl_filters = Q()
            for i in kwargs.get("infoInclude") or []:
                incl_filters |= Q(info__tag__startswith=i)

            excl_filters = Q()
            for i in kwargs.get("infoExclude") or []:
                excl_filters |= Q(info__tag__startswith=i)
            return clusters.filter(
                ~excl_filters & incl_filters
            )
        return fetch_clusters(
            info.context,
            info_include=kwargs.get("infoInclude", []),
            info_exclude=kwargs.get("infoExclude", [])
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
