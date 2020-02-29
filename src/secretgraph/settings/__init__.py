

import os

DEBUG = os.environ.get("DEBUG") == "true"

GRAPHENE = {
    'SCHEMA': 'secretgraph.schema.schema',
    'SCHEMA_OUTPUT': 'data/schema.json',  # defaults to schema.json,
    'SCHEMA_INDENT': 2,
    'MIDDLEWARE': []
}

if DEBUG:
    GRAPHENE['MIDDLEWARE'].append(
        'graphene_django.debug.DjangoDebugMiddleware'
    )
