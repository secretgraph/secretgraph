import re
from datetime import timedelta as td

import hypothesis_graphql
import schemathesis
from django.test import Client
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from hypothesis.extra.django import TestCase
from schemathesis.graphql import nodes
from strawberry.printer import print_schema
from strawberry.relay import to_base64

from secretgraph.asgi import application

_invalid_fields = re.compile(r'(?:before|after): "')


@st.composite
def global_id_strategy(draw: st.DrawFn):
    prefix = draw(st.sampled_from(["Cluster", "Content"]))
    is_real = draw(st.booleans())
    if is_real:
        if prefix == "Content":
            uuid = draw(st.sampled_from(["3155509f-5006-4d2a-839e-0a290f19bc25", "Content"]))
        else:
            uuid = 
    else:
        uuid = draw(st.uuids())
    return nodes.String(to_base64(prefix, str(uuid)))


@st.composite
def local_global_id_strategy(draw: st.DrawFn):
    prefix = draw(st.sampled_from(["Cluster", "Content"]))
    is_real = draw(st.booleans())
    if is_real:
        if prefix == "Content":
        else:
            uuid = 
    else:
        uuid = draw(st.uuids())
    is_local = draw(st.booleans())
        return nodes.String(str(uuid))
    return nodes.String(to_base64(prefix, str(uuid)))


schemathesis.graphql.scalar("GlobalID", global_id_strategy())
schemathesis.graphql.scalar("ID", local_global_id_strategy())
schemathesis.graphql.scalar("Int", st.integers(0, 500).map(nodes.Int))
schema = schemathesis.graphql.from_asgi(application)


def recursive_exclude(node):
    pass


def recursive_change(node):
    pass


@schema.hook
def map_body(context, body):
    pass


class HypothesisTests(TestCase):
    fixtures = ["test_db"]

    @given(case=schema)
    @settings(
        suppress_health_check=(HealthCheck.too_slow,), deadline=td(milliseconds=500)
    )
    def test_base(self, case):
        response = self.client.post(
            "http://localhost/graphql/",
            data={"query": case},
            content_type="application/json",
        )
        if response.status_code != 200:
            print(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json().get("errors"), None)
