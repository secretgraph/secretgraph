__all__ = ["SecretGraphServerConfig"]

from django.apps import AppConfig
from django.db.models.signals import (
    post_delete, pre_delete, post_save, post_migrate
)

from .signals import (
    deleteContentCb, deleteContentValueCb, generateComponentFlexidCb,
    fillEmptyFlexidsCb
)


class SecretGraphServerConfig(AppConfig):
    name = 'secretgraph.server'
    label = 'secretgraph_base'
    verbose_name = 'Secretgraph backend'

    def ready(self):
        from .models import Content, ContentValue, Component
        pre_delete.connect(
            deleteContentCb, sender=Content
        )

        post_delete.connect(
            deleteContentValueCb, sender=ContentValue,
        )

        post_save.connect(
            generateComponentFlexidCb, sender=Component
        )

        post_migrate.connect(
            fillEmptyFlexidsCb, sender=self
        )
