"""
Django settings for secretgraph project.
"""

import os
import time
from pathlib import Path

import certifi

DEBUG = os.environ.get("DEBUG") == "true"

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
BASE_DIR = Path(__file__).resolve(strict=True).parent.parent.parent

# last reload time (secretgraph specific)
LAST_CONFIG_RELOAD_ID = str(time.time())

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/stable/howto/deployment/checklist/


ALLOWED_HOSTS = []

FIXTURE_DIRS = ["tests/fixtures/"]


# Application definition

INSTALLED_APPS = [
    "django.contrib.staticfiles",  # Required for GraphiQL, debug
    "channels",
    "strawberry.django",
    "strawberry_django_plus",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "secretgraph.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.i18n",
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
            ],
        },
    },
]
ASGI_APPLICATION = "secretgraph.asgi.application"
WSGI_APPLICATION = "secretgraph.wsgi.application"

# Password validation
# https://docs.djangoproject.com/en/stable/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",  # noqa: E501
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",  # noqa: E501
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",  # noqa: E501
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",  # noqa: E501
    },
]


# Internationalization
# https://docs.djangoproject.com/en/stable/topics/i18n/

LANGUAGE_CODE = "en"

TIME_ZONE = "UTC"

USE_I18N = True

USE_L10N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/stable/howto/static-files/


STATIC_ROOT = "static/"
STATIC_URL = "/static/"

MEDIA_ROOT = "media/"
MEDIA_URL = "/media/"


LOGIN_URL = "auth:login"
LOGIN_REDIRECT_URL = "auth:profile"
LOGOUT_REDIRECT_URL = "home"


# httpx parameter overwrites (for transfers)
# note: timeout should be low as ddos is possible elsewise
# * "hostname.foo": parameter for specific domain
# * "".foo": parameter for a tld
# * b"default": default parameters for request
# why binary? Because it cannot clash with a "default" host this way
# hierarchy: host > tld > b"default"
SECRETGRAPH_HTTPX_KWARGS_MAP = {
    b"default": {"verify": certifi.where(), "timeout": 3, "proxies": {}},
    # example for usage with tor (requires requests[socks])
    # ".onion": {
    #     "timeout": 10,
    #     "proxies": {
    #        'http': 'socks5://localhost:9050',
    #        'https': 'socks5://localhost:9050'
    #     }
    # }
    # example for a slow domain
    # "veryslow.example": {
    #     "timeout": 60,
    #     "proxies": {}
    # }
}

#  for defining default global groups
SECRETGRAPH_DEFAULT_GROUPS = {}

# specify hash names from most current to most old
SECRETGRAPH_HASH_ALGORITHMS = ["sha512"]
# length of tokens used in file names
SECRETGRAPH_FILETOKEN_LENGTH = 50
# how many chars can tags/refs have per operation
SECRETGRAPH_OPERATION_SIZE_LIMIT = 500000
SECRETGRAPH_TAG_LIMIT = 8000
SECRETGRAPH_DISABLE_SERVERSIDE_DECRYPTION = False

GRAPHENE_PROTECTOR_DEPTH_LIMIT = 20


RATELIMIT_KEY_HASH = "sha512"


CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    # should be local mem cache (default) or dummy cache (for testing)
    # default expiry of caches is 300 seconds
    "secretgraph_settings": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "secretgraph_settings",
    },
}
