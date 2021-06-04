#!/usr/bin/env python

from pathlib import Path
import os
import sys

BASE_DIR = Path(__file__).resolve(strict=True).parent


def main():
    if str(BASE_DIR) not in sys.path:
        sys.path.append(str(BASE_DIR))
    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE", "secretgraph.settings.debug"
    )
    if not os.environ.get(
        "SECRETGRAPH_SILENCE",
        os.environ.get(
            "RUN_MAIN",  # is started with reloader
            os.environ.get(
                "WERKZEUG_RUN_MAIN",  # is started with extensions reloader
                None,
            ),
        ),
    ):
        print("USE SETTINGS:", os.environ["DJANGO_SETTINGS_MODULE"])

    try:
        from django.core.management import execute_from_command_line
    except ImportError:
        # The above import may fail for some other reason. Ensure that the
        # issue is really that Django is missing to avoid masking other
        # exceptions
        try:
            import django  # noqa: F401
        except ImportError:
            raise ImportError(
                "Couldn't import Django. Are you sure it's installed and "
                "available on your PYTHONPATH environment variable? Did you "
                "forget to activate a virtual environment?"
            )
        raise
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
