#! /bin/bash

source .venv/bin/activate
./manage.py runserver_plus&
npm run relay -- --watch&
npm run watch&
wait -nf
kill %1
kill %2
kill %3
