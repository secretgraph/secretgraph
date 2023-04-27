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
# RATELIMIT_ENABLE = False


INSTALLED_APPS += [  # noqa F405
    "django.contrib.auth",  # required for user
    "django.contrib.contenttypes",  # required for auth
    "django.contrib.sessions",  # required for admin
    "django.contrib.messages",  # required for admin
    "django.contrib.admin",  # requires admin
    "secretgraph.server",
    "secretgraph.user",
]

#  for admin
MIDDLEWARE += [  # noqa F405
    "django.contrib.sessions.middleware.SessionMiddleware",  # for auth
    "django.contrib.auth.middleware.AuthenticationMiddleware",  # for auth
    "django.contrib.messages.middleware.MessageMiddleware",  # for admin
]

#  for admin
TEMPLATES[0]["OPTIONS"]["context_processors"] += [  # noqa F405
    "django.contrib.auth.context_processors.auth",
    "django.contrib.messages.context_processors.messages",
]
try:
    import daphne  # noqa: F401

    # before staticfiles
    INSTALLED_APPS.insert(0, "daphne")
except ImportError:
    pass

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# requires auth app
SECRETGRAPH_REQUIRE_USER = False
SECRETGRAPH_USE_USER = True
SECRETGRAPH_ALLOW_REGISTER = True
SECRETGRAPH_ADMINAREA = True
SECRETGRAPH_HEADLESS = False

SECRETGRAPH_DEFAULT_CLUSTER_GROUPS["debug"] = {  # noqa F405
    "properties": ["allow_global_name", "allow_dangerous_actions", "default"],
    "managed": True,
}
SECRETGRAPH_DEFAULT_NET_GROUPS["debug_admin"] = {  # noqa F405
    "properties": [
        "allow_global_name",
        "allow_dangerous_actions",
        "manage_active",
        "allow_featured",
        "allow_hidden",
        "manage_groups",
        "manage_deletion",
        "manage_update",
        "manage_user",
    ],
    "matchUserGroup": True,
}
