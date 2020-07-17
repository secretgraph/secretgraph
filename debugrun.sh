#! /bin/bash

source .venv/bin/activate
./manage.py runserver_plus&
f1=$!
npm run relay -- --watch&
f2=$!
npm run watch&
f3=$!
trap "kill $f1;kill $f2;kill $f3;" err exit SIGINT
wait -nf $f1 $f2 $f3
kill $f1
kill $f2
kill $f3
