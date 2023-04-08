__all__ = ["SecretgraphServerConfig"]

from django.apps import AppConfig
from django.db.models.signals import (
    post_delete,
    pre_delete,
    post_save,
    post_migrate,
)
from django.core.signals import (
    got_request_exception,
    request_started,
)

from .signals import (
    deleteContentCb,
    deleteEncryptedFileCb,
    deleteSizePreCb,
    deleteSizeCommitCb,
    generateFlexid,
    regenerateKeyHash,
    fillEmptyFlexidsCb,
    initializeDb,
    rollbackUsedActionsAndFreeze,
    sweepContentsAndClusters,
)


class SecretgraphServerConfig(AppConfig):
    name = "secretgraph.server"
    label = "secretgraph"
    verbose_name = "Secretgraph backend"

    def ready(self):
        from .models import Content, Cluster

        pre_delete.connect(
            deleteContentCb,
            sender=Content,
            dispatch_uid="secretgraph_ContentdeleteContentCb",
        )

        post_delete.connect(
            deleteEncryptedFileCb,
            sender=Content,
            dispatch_uid="secretgraph_ContentdeleteEncryptedFileCb",
        )
        pre_delete.connect(
            deleteSizePreCb,
            sender=Content,
            dispatch_uid="secretgraph_ContentdeleteSizePreCb",
        )
        post_delete.connect(
            deleteSizeCommitCb,
            sender=Content,
            dispatch_uid="secretgraph_ContentdeleteSizeCommitCb",
        )
        pre_delete.connect(
            deleteSizePreCb,
            sender=Cluster,
            dispatch_uid="secretgraph_ClusterdeleteSizePreCb",
        )
        post_delete.connect(
            deleteSizeCommitCb,
            sender=Cluster,
            dispatch_uid="secretgraph_ClusterdeleteSizeCommitCb",
        )

        post_save.connect(
            generateFlexid,
            sender=Cluster,
            dispatch_uid="secretgraph_ClustergenerateFlexid",
        )

        post_save.connect(
            generateFlexid,
            sender=Content,
            dispatch_uid="secretgraph_ContentgenerateFlexid",
        )

        post_migrate.connect(
            initializeDb,
            sender=self,
            dispatch_uid="secretgraph_initializeDb",
        )

        post_migrate.connect(
            fillEmptyFlexidsCb,
            sender=self,
            dispatch_uid="secretgraph_fillEmptyFlexidsCb",
        )

        post_migrate.connect(
            regenerateKeyHash,
            sender=self,
            dispatch_uid="secretgraph_regenerateKeyHash",
        )
        got_request_exception.connect(
            rollbackUsedActionsAndFreeze,
            sender=self,
            dispatch_uid="secretgraph_rollbackUsedActions",
        )
        request_started.connect(
            sweepContentsAndClusters,
            sender=self,
            dispatch_uid="secretgraph_sweepContentsAndClusters",
        )
