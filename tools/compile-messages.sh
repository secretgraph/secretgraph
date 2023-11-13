#! /bin/sh

basedir="$(dirname $0)"
basedir="$(dirname "$basedir")"
cd "$basedir"

./manage.py compilemessages  --ignore ".tox/**/*" --ignore ".venv/**/*"
