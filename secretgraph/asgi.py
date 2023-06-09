"""
ASGI config for secretgraph project.

It exposes the ASGI callable as a module-level variable named ``application``.

"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve(strict=True).parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import (  # noqa: E402
    AllowedHostsOriginValidator,
)
from django.core.asgi import get_asgi_application  # noqa: E402
from django.urls import re_path  # noqa: E402
from strawberry.channels import GraphQLWSConsumer  # noqa: E402

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
    re_path(r"graphql/?$", GraphQLWSConsumer.as_asgi(schema=schema)),
]
websocket_stack = URLRouter(websocket_urlpatterns)
if "django.contrib.auth" in settings.INSTALLED_APPS:
    websocket_stack = AuthMiddlewareStack(websocket_stack)
websocket_stack = AllowedHostsOriginValidator(websocket_stack)

application = ProtocolTypeRouter(
    {"http": django_asgi_app, "websocket": websocket_stack}
)
