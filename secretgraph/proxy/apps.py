__all__ = ["SecretGraphProxyConfig"]

from django.apps import AppConfig


class SecretGraphProxyConfig(AppConfig):
    name = 'secretgraph.proxy'
    label = 'secretgraph_proxy'
    verbose_name = 'Secretgraph proxy'
