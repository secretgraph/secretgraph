import os

os.environ["DEBUG"] = "true"

from secretgraph.settings.withclient import *  # noqa: F403, F401, E402

ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.path.join(BASE_DIR, "db.sqlite3"),  # noqa F405
    }
}

SECRET_KEY = "CHANGEME"
# RATELIMIT_ENABLED = False


INSTALLED_APPS += [  # noqa F405
    "django.contrib.auth",  # required for user
    "django.contrib.contenttypes",  # required for auth
    "django.contrib.sessions",  # required for admin
    "django.contrib.messages",  # required for admin
    "django.contrib.admin",  # requires admin
    "django_fast_iprestrict",
    "secretgraph.server",
    "secretgraph.user",
]
try:
    import daphne  # noqa: F401

    # before staticfiles
    INSTALLED_APPS.insert(0, "daphne")
except ImportError:
    pass


#  for admin
MIDDLEWARE += [  # noqa F405
    "django.contrib.sessions.middleware.SessionMiddleware",  # for auth
    "django.contrib.auth.middleware.AuthenticationMiddleware",  # for auth
    "django.contrib.messages.middleware.MessageMiddleware",  # for admin
    "django_fast_iprestrict.middleware.fast_iprestrict",  # for ratelimiting
]

#  for admin
TEMPLATES[0]["OPTIONS"]["context_processors"] += [  # noqa F405
    "django.contrib.auth.context_processors.auth",
    "django.contrib.messages.context_processors.messages",
]
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


SECRETGRAPH_DEFAULT_CLUSTER_GROUPS["debug_selectable"] = {  # noqa F405
    "properties": [],
    "managed": True,
    "userSelectable": "SELECTABLE",
}

SECRETGRAPH_DEFAULT_CLUSTER_GROUPS["debug_deselectable"] = {  # noqa F405
    "properties": ["default"],
    "managed": True,
    "userSelectable": "DESELECTABLE",
}
SECRETGRAPH_DEFAULT_CLUSTER_GROUPS["debug_unrestricted"] = {  # noqa F405
    "properties": [],
    "managed": True,
    "userSelectable": "UNRESTRICTED",
}

SECRETGRAPH_DEFAULT_CLUSTER_GROUPS["debug_initial"] = {  # noqa F405
    "properties": [],
    "managed": True,
    "userSelectable": "INITIAL_MODIFYABLE",
}


SECRETGRAPH_DEFAULT_NET_GROUPS["debug_advanced"] = {  # noqa F405
    "properties": [
        "allow_global_name",
        "allow_dangerous_actions",
    ],
    "managed": True,
    "userSelectable": "UNRESTRICTED",
}
SECRETGRAPH_DEFAULT_NET_GROUPS["debug_admin"] = {  # noqa F405
    "properties": [
        "allow_global_name",
        "allow_dangerous_actions",
        "manage_active",
        "allow_featured",
        "allow_hidden",
        "allow_hidden_net",
        "allow_hidden_net_props",
        "manage_net_groups",
        "manage_cluster_groups",
        "manage_delete",
        "manage_update",
        "manage_user",
    ],
    "userSelectable": "DESELECTABLE",
}

# silences warnings while testing, files are iterated not async
# raw files are more efficient when using a real async server
SECRETGRAPH_USE_RAW_FILE_WHEN_POSSIBLE = False
