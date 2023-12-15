#! /bin/sh

install_gettext(){
if which apt-get &> /dev/null; then
    apt-get update
    apt-get install -y gettext
    apt-get clean

elif which apk &> /dev/null; then
    apk add --no-cache gettext gettext-dev
elif which pacman &> /dev/null; then
    pacman --cachedir /tmp/pacman_secretgraph -Sy --noconfirm --needed gettext
    rm -rf /tmp/pacman/pacman_secretgraph
fi

}

if which gettext &> /dev/null; then
  install_gettext
fi
