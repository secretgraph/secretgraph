__all__ = ["SecretgraphServerConfig"]

import logging

from django.apps import AppConfig
from django.core.signals import got_request_exception, request_started
from django.db.models.signals import (
    post_delete,
    post_migrate,
    post_save,
    pre_delete,
)

from .signals import (
    deleteContentCb,
    deleteEncryptedFileCb,
    deleteSizeCommitCb,
    deleteSizePreCb,
    fillEmptyFlexidsCb,
    generateFlexid,
    initializeDb,
    notifyDeletion,
    notifyUpdateOrCreate,
    regenerateKeyHash,
    rollbackUsedActionsAndFreeze,
    sweepOutdated,
)

logger = logging.getLogger(__name__)


class SecretgraphServerConfig(AppConfig):
    name = "secretgraph.server"
    label = "secretgraph"
    verbose_name = "Secretgraph backend"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from .models import Cluster, Content
        from .utils.misc import get_secretgraph_channel

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

        if get_secretgraph_channel() and hasattr(post_save, "asend"):
            post_save.connect(
                notifyUpdateOrCreate,
                sender=Cluster,
                dispatch_uid="secretgraph_ClusternotifyUpdateOrCreate",
            )

            post_save.connect(
                notifyUpdateOrCreate,
                sender=Content,
                dispatch_uid="secretgraph_ContentnotifyUpdateOrCreate",
            )

            post_delete.connect(
                notifyDeletion,
                sender=Cluster,
                dispatch_uid="secretgraph_ClusternotifyDeletion",
            )

            post_delete.connect(
                notifyDeletion,
                sender=Content,
                dispatch_uid="secretgraph_ContentnotifyDeletion",
            )
        else:
            logger.info(
                "django too old/no channel layers defined. disable notification"
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
            dispatch_uid="secretgraph_rollbackUsedActionsAndFreeze",
        )
        request_started.connect(
            sweepOutdated,
            sender=self,
            dispatch_uid="secretgraph_sweepContentsAndClusters",
        )
