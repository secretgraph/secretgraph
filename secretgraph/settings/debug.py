
import os

os.environ["DEBUG"] = True

from secretgraph.settings import *  # noqa: F403, F401


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
    }
}

FIXTURE_DIRS = [
    "tests/fixtures/"
]
