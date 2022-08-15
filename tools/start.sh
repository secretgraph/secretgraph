#! /bin/sh

chown secretgraph:secretgraph /var/secretgraph/
chown -R secretgraph:www-data /var/secretgraph/static
chown -R secretgraph:www-data /var/secretgraph/media
setpriv --reuid=secretgraph --regid=www-data --init-groups --inh-caps=-all ./start_noroot.sh
