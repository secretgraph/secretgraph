
import os

os.environ["DEBUG"] = "true"

from secretgraph.settings import *  # noqa: F403, F401


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),  # noqa F405
    }
}

FIXTURE_DIRS = [
    "tests/fixtures/"
]

SECRET_KEY = "CHANGEME"

INSTALLED_APPS += [  # noqa F405
    'django.contrib.admin',
    'django.contrib.messages',  # required for admin
    'django.contrib.contenttypes',  # required for admin
    "secretgraph.server"
]

SECRETGRAPH_BIND_TO_USER = True
