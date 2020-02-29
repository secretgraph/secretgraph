__all__ = ["SecretGraphServerConfig"]

from django.apps import AppConfig
from django.db.models.signals import (
    post_delete, pre_delete
)

from .signals import (
    deleteContentCb, deleteContentValueCb
)


class SecretGraphServerConfig(AppConfig):
    name = 'secretgraph.server'
    label = 'secretgraph_base'
    verbose_name = 'Secretgraph backend'

    def ready(self):
        from .models import Content, ContentValue
        pre_delete.connect(
            deleteContentCb, sender=Content
        )

        post_delete.connect(
            deleteContentValueCb, sender=ContentValue,
        )
