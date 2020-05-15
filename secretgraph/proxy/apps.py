__all__ = ["SecretgraphProxyConfig"]

from django.apps import AppConfig


class SecretgraphProxyConfig(AppConfig):
    name = 'secretgraph.proxy'
    label = 'secretgraph_proxy'
    verbose_name = 'Secretgraph proxy'
