#! /usr/bin/env python3

import os
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
subprocess.run(["./manage.py", "migrate"], cwd=BASE_DIR, check=True)
if os.path.ismount(os.path.join(BASE_DIR, "static")):
    subprocess.run(["./manage.py", "collectstatic"], cwd=BASE_DIR, check=True)
subprocess.run(
    ["hypercorn", "-b", "[::]:8000", "secretgraph.asgi:application"],
    cwd=BASE_DIR,
)
