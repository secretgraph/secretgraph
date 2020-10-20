from secretgraph.settings import *  # noqa: F403, F401

INSTALLED_APPS += [  # noqa F405
    "manifest_loader",
    "secretgraph.proxy"
]

STATICFILES_DIRS = globals().get("STATICFILES_DIRS", []) + [  # noqa F405
    ("webpack_bundles", BASE_DIR / "webpack_bundles"),  # noqa F405
]

MANIFEST_LOADER = {
    'output_dir': BASE_DIR / "webpack_bundles",  # noqa F405
    'manifest_file': 'manifest.json',
    'cache': not DEBUG,  # noqa F405
    'ignore_missing_assets': False,
    'ignore_missing_match_tag': False,
}
