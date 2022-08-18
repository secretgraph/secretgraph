#! /bin/sh

basedir="$(dirname $0)"
basedir="$(dirname "$basedir")"
cd "$basedir"
./manage.py migrate
./manage.py collectstatic --noinput
hypercorn -b unix:///sockets/asgi.socket -m 007 secretgraph.asgi:application
