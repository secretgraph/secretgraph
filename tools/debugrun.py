#! /usr/bin/env python3
import os
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

if __name__ == "__main__":
    with subprocess.Popen(["npm", "run", "serve:dev"], cwd=BASE_DIR) as npm:
        with subprocess.Popen(
            ["poetry", "run", "./manage.py", "runserver"],
            cwd=BASE_DIR,
        ) as django:
            while npm.poll() is None and django.poll() is None:
                try:
                    django.communicate(timeout=50)
                except Exception:
                    pass
