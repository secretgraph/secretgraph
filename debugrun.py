#! /usr/bin/env python3
import subprocess


if __name__ == "__main__":
    with subprocess.Popen(["npm", "run", "serve:dev"]) as npm:
        with subprocess.Popen(
            ["python", "./manage.py", "runserver_plus"]
        ) as django:
            while npm.poll() is None and django.poll() is None:
                try:
                    django.communicate(timeout=50)
                except Exception:
                    pass
