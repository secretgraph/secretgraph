#! /bin/bash

source .venv/bin/activate
trap "" err exit SIGINT
npm run relay -- --watch&
f1=$!
npm run watch&
f2=$!
./manage.py runserver_plus&
f3=$!
trap "kill $f1;kill $f2;kill $f3;" err exit SIGINT
wait -nf $f1 $f2 $f3
kill $f1
kill $f2
kill $f3
