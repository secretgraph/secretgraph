import re

import hypothesis_graphql
from django.test import Client
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from hypothesis.extra.django import TestCase
from hypothesis_graphql import nodes
from strawberry.printer import print_schema
from strawberry.relay import to_base64

from secretgraph.schema import schema

_invalid_fields = re.compile(r'(?:before|after): "')


@st.composite
def global_id_strategy(draw: st.DrawFn):
    prefix = draw(st.sampled_from(["Cluster", "Content"]))
    uuid = draw(st.uuids())
    return nodes.String(to_base64(prefix, str(uuid)))


base_strategy = hypothesis_graphql.queries(
    print_schema(schema),
    custom_scalars={
        # Standard scalars work out of the box, for custom ones you need
        # to pass custom strategies that generate proper AST nodes
        "GlobalID": global_id_strategy(),
        "ID": global_id_strategy(),
        "Int": st.integers(0, 500).map(nodes.Int),
    },
).filter(lambda x: not _invalid_fields.search(x))


class HypothesisTests(TestCase):
    fixtures = ["recoverable_broken_db"]

    def setUp(self) -> None:
        self.client = Client()
        return super().setUp()

    @given(case=base_strategy)
    @settings(suppress_health_check=(HealthCheck.too_slow,))
    def test_base(self, case):
        response = self.client.post(
            "http://localhost/graphql",
            data={"query": case},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json().get("errors"), None)
