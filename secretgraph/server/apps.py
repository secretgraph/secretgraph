__all__ = ["SecretgraphServerConfig"]

from django.apps import AppConfig
from django.db.models.signals import (
    post_delete,
    pre_delete,
    post_save,
    post_migrate,
)

from .signals import (
    deleteContentCb,
    deleteEncryptedFileCb,
    generateFlexid,
    regenerateKeyHash,
    fillEmptyFlexidsCb,
    initializeDb,
)


class SecretgraphServerConfig(AppConfig):
    name = "secretgraph.server"
    label = "secretgraph"
    verbose_name = "Secretgraph backend"

    def ready(self):
        from .models import Content, Cluster

        pre_delete.connect(deleteContentCb, sender=Content)

        post_delete.connect(
            deleteEncryptedFileCb,
            sender=Content,
        )

        post_save.connect(generateFlexid, sender=Cluster)

        post_save.connect(generateFlexid, sender=Content)

        post_migrate.connect(initializeDb, sender=self)

        post_migrate.connect(fillEmptyFlexidsCb, sender=self)

        post_migrate.connect(regenerateKeyHash, sender=self)
