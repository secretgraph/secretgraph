
import os

os.environ["DEBUG"] = "true"

from secretgraph.settings.withclient import *  # noqa: F403, F401, E402


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
    "secretgraph.user",
    "secretgraph.server"
]

AUTH_USER_MODEL = "secretgraph_user.QuotaUser"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
# requires auth app
SECRETGRAPH_BIND_TO_USER = False
SECRETGRAPH_ALLOW_REGISTER = True
