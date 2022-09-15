import os

os.environ["DEBUG"] = "true"

from secretgraph.settings.withclient import *  # noqa: F403, F401, E402


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.path.join(BASE_DIR, "db.sqlite3"),  # noqa F405
    }
}

SECRET_KEY = "CHANGEME"


INSTALLED_APPS += [  # noqa F405
    "django.contrib.auth",  # required for user
    "django.contrib.contenttypes",  # required for auth
    "secretgraph.server",
]
try:
    import daphne  # noqa: F401

    # before staticfiles
    INSTALLED_APPS.insert(0, "daphne")
except ImportError:
    pass

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# requires auth app
SECRETGRAPH_BIND_TO_USER = False
SECRETGRAPH_ALLOW_REGISTER = True
