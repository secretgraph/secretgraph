#! /bin/sh

./manage.py collectstatic
hypercorn secretgraph.server.asgi:application
