#! /bin/sh

source .venv/bin/activate
trap "" err exit INT
npm run watch&
f1=$!
./manage.py runserver_plus --nothreading&
f2=$!
trap "kill $f1;kill $f2;" err exit INT
wait -nf $f1 $f2
kill $f1
kill $f2
