#! /bin/bash

start="$(dirname $0)/start.sh"

usermod -a -G ${USER_GROUP:www-data} secretgraph
chown secretgraph:secretgraph /var/lib/secretgraph/
# static is a mount
chown -R secretgraph:${USER_GROUP:www-data} /app/static
chown -R secretgraph:${USER_GROUP:www-data} /sockets
mkdir -p /var/lib/secretgraph/media
chown -R secretgraph:${USER_GROUP:www-data} /var/lib/secretgraph/media
setpriv --reuid=secretgraph --regid=${USER_GROUP:www-data} --init-groups --inh-caps=-all "$start"
