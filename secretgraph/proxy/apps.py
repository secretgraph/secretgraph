__all__ = ["SecretgraphProxyConfig"]

from django.apps import AppConfig

from django.views import static


original_serve = static.serve


def my_static_serve(*args, **kwargs):
    response = original_serve(*args, **kwargs)
    response["Service-Worker-Allowed"] = "/"
    return response


class SecretgraphProxyConfig(AppConfig):
    name = "secretgraph.proxy"
    label = "secretgraph_proxy"
    verbose_name = "Secretgraph proxy"

    def ready(self):
        global patched
        from django.conf import settings

        if my_static_serve != static.serve and settings.DEBUG:
            static.serve = my_static_serve
            print("patched for serviceworkers")
