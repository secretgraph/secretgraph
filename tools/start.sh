#! /bin/sh

basedir="$(dirname $0)"
basedir="$(dirname "$basedir")"
cd "$basedir"
./manage.py migrate
./manage.py collectstatic --noinput
hypercorn -b unix:///var/secretgraph/asgi.socket -m 000 secretgraph.asgi:application
