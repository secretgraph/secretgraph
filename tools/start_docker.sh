#! /bin/sh

start="$(dirname $0)/start.py"

chown secretgraph:secretgraph /var/secretgraph/
# static is a mount
chown -R secretgraph:www-data /app/static
mkdir -p /var/secretgraph/media
chown -R secretgraph:www-data /var/secretgraph/media
setpriv --reuid=secretgraph --regid=www-data --init-groups --inh-caps=-all "$start"
