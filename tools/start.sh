#! /bin/sh

basedir="$(dirname $0)"
basedir="$(dirname "$basedir")"
cd basedir
./manage.py migrate
./manage.py collectstatic --noinput
hypercorn -b 0.0.0.0:8001 secretgraph.asgi:application
