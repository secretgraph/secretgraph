__all__ = ["SecretGraphServerConfig"]

from django.apps import AppConfig
from django.db.models.signals import (
    post_delete, pre_delete, post_save, post_migrate
)

from .signals import (
    deleteContentCb, deleteEncryptedFileCb, generateFlexid,
    fillEmptyFlexidsCb
)


class SecretGraphServerConfig(AppConfig):
    name = 'secretgraph.server'
    label = 'secretgraph_base'
    verbose_name = 'Secretgraph backend'

    def ready(self):
        from .models import Content, ContentFile, Component
        pre_delete.connect(
            deleteContentCb, sender=Content
        )

        post_delete.connect(
            deleteEncryptedFileCb, sender=ContentFile,
        )

        post_save.connect(
            generateFlexid, sender=Component
        )

        post_save.connect(
            generateFlexid, sender=Content
        )

        post_save.connect(
            generateFlexid, sender=ContentValue
        )

        post_migrate.connect(
            fillEmptyFlexidsCb, sender=self
        )
