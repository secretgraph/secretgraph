import os
import secrets
from secretgraph.settings.withclient import *  # noqa: F403, F401, E402

DOCKER_VOLUME_DIR = "/var/lib/secretgraph"

STATIC_ROOT = "/static/"

DATABASES = {
    "default": {
        "ENGINE": os.environ.get("DB_ENGINE", "django.db.backends.sqlite3"),
        "NAME": os.environ.get(
            "DB_NAME", os.path.join(DOCKER_VOLUME_DIR, "db.sqlite3")
        ),
        "USER": os.environ.get("DB_USER", ""),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", ""),
        "PORT": os.environ.get("DB_PORT", ""),
    }
}

SECRET_KEY = os.environ.get("SECRET_KEY", secrets.token_hex(32))


INSTALLED_APPS += [  # noqa F405
    "django.contrib.sessions",  # required for auth
    "django.contrib.auth",  # required for user
    "django.contrib.contenttypes",  # required for auth
    "secretgraph.server",
    "secretgraph.user",
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# requires auth app
SECRETGRAPH_BIND_TO_USER = (
    os.environ.get("BIND_TO_USER", "true").lower() == "true"
)
SECRETGRAPH_ALLOW_REGISTER = (
    os.environ.get("ALLOW_REGISTER", "false").lower() == "true"
)

# for auth
MIDDLEWARE += [  # noqa F405
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]


SECRETGRAPH_USER_ADMINAREA = (
    os.environ.get("USER_ADMINAREA", "false").lower() == "true"
)
if SECRETGRAPH_USER_ADMINAREA:
    INSTALLED_APPS += [  # noqa F405
        "django.contrib.admin",
        "django.contrib.messages",
    ]
    MIDDLEWARE += [  # noqa F405
        "django.contrib.sessions.middleware.SessionMiddleware",
        "django.contrib.auth.middleware.AuthenticationMiddleware",
        "django.contrib.messages.middleware.MessageMiddleware",
    ]
    TEMPLATES[0]["OPTIONS"]["context_processors"] += [  # noqa F405
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]

SECRETGRAPH_CACHE_DECRYPTED = (
    os.environ.get("CACHE_DECRYPTED", "false").lower() == "true"
)


def _get_ratelimit(key: str):
    rl = os.environ.get(f"RATELIMIT_{key}", None)
    if not rl:
        return
    if rl.lower() == "none":
        rl = None
    SECRETGRAPH_RATELIMITS[key] = rl  # noqa F405


for key in SECRETGRAPH_RATELIMITS.keys():  # noqa F405
    _get_ratelimit(key)


MEDIA_ROOT = os.path.join(DOCKER_VOLUME_DIR, "media/")
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost").split(",")

SECRETGRAPH_DEFAULT_GROUPS["docker"] = {  # noqa F405
    "properties": ["allow_dangerous_actions", "default"],
}
SECRETGRAPH_DEFAULT_GROUPS["docker_admin"] = {  # noqa F405
    "properties": [
        "allow_global_name",
        "allow_dangerous_actions",
        "manage_featured",
        "manage_active",
        "manage_hidden",
        "manage_groups",
        "manage_deletion",
        "manage_update",
    ],
}
