import os
from secretgraph.settings import *  # noqa: F403, F401

INSTALLED_APPS += [  # noqa F405
    "webpack_loader",
    "secretgraph.proxy"
]

STATICFILES_DIRS = [  # noqa F405
    ("webpack_bundles", "webpack_bundles"),
]

WEBPACK_LOADER = {
    'DEFAULT': {
        'CACHE': not DEBUG,  # noqa F405
        'BUNDLE_DIR_NAME': 'webpack_bundles/',
        'STATS_FILE': os.path.join(BASE_DIR, 'webpack-stats.json'),  # noqa F405
        'IGNORE': [r'.+\.hot-update.js', r'.+\.map'],
    }
}

if not DEBUG:  # noqa F405
    WEBPACK_LOADER.update({
        # 'BUNDLE_DIR_NAME': 'webpack_bundles/',
        # 'STATS_FILE': os.path.join(BASE_DIR, 'webpack-stats-prod.json')  # noqa F405
    })
