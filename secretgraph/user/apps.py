__all__ = ["SecretGraphUserConfig"]

from django.apps import AppConfig


class SecretGraphUserConfig(AppConfig):
    name = 'secretgraph.user'
    label = 'secretgraph_user'
    verbose_name = 'Secretgraph User'
