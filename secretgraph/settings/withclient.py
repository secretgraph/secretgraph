from secretgraph.settings import *  # noqa: F403, F401

INSTALLED_APPS += [  # noqa F405
    "manifest_loader",
    "secretgraph.proxy"
]

STATICFILES_DIRS = [  # noqa F405
    ("webpack_bundles", "webpack_bundles"),
]

MANIFEST_LOADER = {
    'output_dir': None,
    'manifest_file': 'manifest.json',
    'cache': not DEBUG,  # noqa F405
    'ignore_missing_assets': False,
    'ignore_missing_match_tag': False,
}
