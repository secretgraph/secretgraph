#! /bin/sh
basedir="$(dirname $0)"
basedir="$(dirname "$basedir")"
cd "$basedir"
env DJANGO_SETTINGS_MODULE=secretgraph.settings.test poetry run ./manage.py test tests
