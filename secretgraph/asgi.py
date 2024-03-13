"""
ASGI config for secretgraph project.

It exposes the ASGI callable as a module-level variable named ``application``.

"""

import os
import sys

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import (
    AllowedHostsOriginValidator,
)
from django.core.asgi import get_asgi_application
from django.urls import path
from strawberry.channels import GraphQLWSConsumer


async def LifeSpanHandler(scope, receive, send):
    while True:
        message = await receive()
        if message["type"] == "lifespan.startup":
            await send({"type": "lifespan.startup.complete"})
        elif message["type"] == "lifespan.shutdown":
            await send({"type": "lifespan.shutdown.complete"})
            return


def create_application():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "secretgraph.settings.debug")
    if not os.environ.get(
        "SECRETGRAPH_SILENCE",
        "django.core.management" in sys.modules,  # is loaded by manage.py
    ):
        print("USE SETTINGS:", os.environ["DJANGO_SETTINGS_MODULE"])

    django_asgi_app = get_asgi_application()

    # Import your Strawberry schema after creating the django ASGI application
    # This ensures django.setup() has been called before any ORM models
    # are imported for the schema.

    from django.conf import settings  # noqa: E402

    from .schema import schema  # noqa: E402

    websocket_urlpatterns = [
        path(r"graphql/", GraphQLWSConsumer.as_asgi(schema=schema)),
    ]
    websocket_stack = URLRouter(websocket_urlpatterns)
    if "django.contrib.auth" in settings.INSTALLED_APPS:
        websocket_stack = AuthMiddlewareStack(websocket_stack)
    websocket_stack = AllowedHostsOriginValidator(websocket_stack)

    return ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": websocket_stack,
            "lifespan": LifeSpanHandler,
        }
    )


application = create_application()
