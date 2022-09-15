"""
WSGI config for secretgraph project.

It exposes the WSGI callable as a module-level variable named ``application``.

"""

# WARNING: prefer asgi over wsgi as wsgi lacks lots of features like websockets

from pathlib import Path
import os
import sys

BASE_DIR = Path(__file__).resolve(strict=True).parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from django.core.wsgi import get_wsgi_application  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "secretgraph.settings.debug")
if not os.environ.get(
    "SECRETGRAPH_SILENCE",
    "django.core.management" in sys.modules,  # is loaded by manage.py
):
    print("USE SETTINGS:", os.environ["DJANGO_SETTINGS_MODULE"])

application = get_wsgi_application()
