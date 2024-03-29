#! /bin/sh

basedir="$(dirname $0)"
basedir="$(dirname "$basedir")"
cd "$basedir"
./manage.py migrate --noinput
./manage.py collectstatic --noinput
hypercorn -b unix:///sockets/asgi.socket -m 007 secretgraph.asgi:application --graceful-timeout 8 -k uvloop
