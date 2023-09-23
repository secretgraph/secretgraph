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

MEDIA_ROOT = os.path.join(DOCKER_VOLUME_DIR, "media/")
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost").split(",")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
RATELIMIT_TRUSTED_PROXIES = os.environ.get("TRUSTED_PROXIES", "unix").split(
    ","
)
if RATELIMIT_TRUSTED_PROXIES[0] == "all":
    RATELIMIT_TRUSTED_PROXIES = "all"


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# requires auth app
SECRETGRAPH_REQUIRE_USER = (
    os.environ.get("REQUIRE_USER", "true").lower() == "true"
)
SECRETGRAPH_ALLOW_REGISTER = (
    os.environ.get("ALLOW_REGISTER", "false").lower() == "true"
)

SECRETGRAPH_ADMINAREA = (
    os.environ.get("SECRETGRAPH_ADMINAREA", "false").lower() == "true"
)
SECRETGRAPH_HEADLESS = (
    os.environ.get("SECRETGRAPH_HEADLESS", "false").lower() == "true"
)
NO_USERS = os.environ.get("SECRETGRAPH_NO_USERS", "false").lower() == "true"
if not NO_USERS:
    INSTALLED_APPS += [  # noqa F405
        "django.contrib.sessions",  # required for auth
        "django.contrib.admin",  # required for templates (and for SECRETGRAPH_ADMINAREA)
        "django.contrib.auth",  # required for user
        "django.contrib.contenttypes",  # required for auth
        "secretgraph.server",
        "secretgraph.user",
    ]
    # for auth
    MIDDLEWARE += [  # noqa F405
        "django.contrib.sessions.middleware.SessionMiddleware",
        "django.contrib.auth.middleware.AuthenticationMiddleware",
    ]
    TEMPLATES[0]["OPTIONS"]["context_processors"].append(  # noqa F405
        "django.contrib.auth.context_processors.auth"
    )
else:
    if SECRETGRAPH_ADMINAREA or SECRETGRAPH_REQUIRE_USER:
        raise Exception(
            "SECRETGRAPH_ADMINAREA and SECRETGRAPH_REQUIRE_USER "
            "cannot be specified with NO_USERS=true"
        )

if SECRETGRAPH_ADMINAREA:
    INSTALLED_APPS += [  # noqa F405
        "django.contrib.messages",
    ]
    MIDDLEWARE += [  # noqa F405
        "django.contrib.messages.middleware.MessageMiddleware",
    ]
    TEMPLATES[0]["OPTIONS"]["context_processors"].append(  # noqa F405
        "django.contrib.messages.context_processors.messages"
    )

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


SECRETGRAPH_DEFAULT_CLUSTER_GROUPS["docker"] = {  # noqa F405
    "properties": ["allow_dangerous_actions", "default"],
}
SECRETGRAPH_DEFAULT_NET_GROUPS["docker_admin"] = {  # noqa F405
    "properties": [
        "allow_global_name",
        "allow_dangerous_actions",
        "allow_featured",
        "manage_active",
        "allow_hidden",
        "allow_hidden_net",
        "allow_hidden_net_props",
        "manage_net_groups",
        "manage_cluster_groups",
        "manage_deletion",
        "manage_update",
        "manage_user",
    ],
}
