import os

os.environ["DEBUG"] = "true"

from secretgraph.settings.debug import *  # noqa: F403, F401, E402

DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
}
RATELIMIT_ENABLE = False

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.InMemoryStorage",
    },
    "staticfiles": {
        "BACKEND": "django.core.files.storage.InMemoryStorage",
    },
}
