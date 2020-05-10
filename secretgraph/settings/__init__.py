
"""
Django settings for secretgraph project.
"""

import os

import certifi

DEBUG = os.environ.get("DEBUG") == "true"
DEBUG = True

# Build paths inside the project like this: os.path.join(BASE_DIR, ...)
BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)


GRAPHENE = {
    'SCHEMA': 'secretgraph.schema.schema',
    'SCHEMA_OUTPUT': 'data/schema.json',  # defaults to schema.json,
    'SCHEMA_INDENT': 2,
    'MIDDLEWARE': []
}

if DEBUG:
    GRAPHENE['MIDDLEWARE'].append(
        'graphene_django.debug.DjangoDebugMiddleware'
    )

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/1.11/howto/deployment/checklist/


ALLOWED_HOSTS = []

# FILE_UPLOAD_HANDLERS = [
#    'django.core.files.uploadhandler.MemoryFileUploadHandler',
#    "spkcspider.apps.spider.functions.LimitedTemporaryFileUploadHandler",
# ]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',  # Required for GraphiQL
    'graphene_django'
]
try:
    import django_extensions  # noqa: F401
    INSTALLED_APPS.append('django_extensions')
except ImportError:
    pass


MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'secretgraph.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.i18n',
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]
WSGI_APPLICATION = 'secretgraph.wsgi.application'

# Password validation
# https://docs.djangoproject.com/en/1.11/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',  # noqa: E501
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',  # noqa: E501
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',  # noqa: E501
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',  # noqa: E501
    },
]


# Internationalization
# https://docs.djangoproject.com/en/1.11/topics/i18n/

LANGUAGE_CODE = 'en'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_L10N = True

USE_TZ = True


STATICFILES_DIRS = [
    # add node_modules as node_modules under static
    ("node_modules", "node_modules")
]

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/1.11/howto/static-files/


STATIC_ROOT = 'static/'
STATIC_URL = '/static/'

MEDIA_ROOT = 'media/'
MEDIA_URL = '/media/'


LOGIN_URL = "auth:login"
LOGIN_REDIRECT_URL = "auth:profile"
LOGOUT_REDIRECT_URL = "home"

# AUTH_USER_MODEL = 'spider_accounts.SpiderUser'

# require serverside encryption
# SECRETGRAPH_SERVERSIDE_ENCRYPTION = True
# requests parameter overwrites
# * "hostname.foo": parameter for specific domain
# * "".foo": parameter for a tld
# * b"default": default parameters for request
# why binary? Because it cannot clash with a "default" host this way
# hierarchy: host > tld > b"default"
SECRETGRAPH_REQUEST_KWARGS_MAP = {
    b"default": {
        "verify": certifi.where(),
        "timeout": 3,
        "proxies": {}
    },
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

# specify hash names from most current to most old
SECRETGRAPH_HASH_ALGORITHMS = ["sha512"]

# for sites
SITE_ID = 1
