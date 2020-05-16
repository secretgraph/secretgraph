
import graphene
from django.conf import settings
from graphene import relay
from graphql_relay import from_global_id

from ..actions.view import fetch_clusters, fetch_contents
from ..models import Cluster, Content
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
        )["objects"].first()

    def resolve_clusters(
        self, info, public=None, featured=False, user=None, **kwargs
    ):
        if featured and public is None:
            public = True
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
        if public in {True, False}:
            clusters = clusters.filter(public=public)

        return fetch_clusters(
            info.context,
            clusters,
            info_include=kwargs.get("infoInclude", []),
            info_exclude=kwargs.get("infoExclude", [])
        )["objects"]

    def resolve_content(self, info, id, **kwargs):
        return fetch_contents(
            info.context, query=id
        )["objects"].first()

    def resolve_contents(self, info, public=None, cluster=None, **kwargs):
        contents = Content.objects.all()
        if cluster:
            _type = "Cluster"
            try:
                _type, cluster = from_global_id(cluster)[1]
            except Exception:
                pass
            if _type != "Cluster":
                raise ValueError("Not a cluster id")
            contents = contents.filter(flexid=cluster)
        if public in {True, False}:
            if public:
                contents = contents.filter(info__tag="public")
            else:
                contents = contents.exclude(info__tag="public")

        return fetch_contents(
            info.context,
            contents,
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
