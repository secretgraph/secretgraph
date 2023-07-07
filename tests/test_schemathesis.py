import schemathesis
from django.test import RequestFactory, TestCase
from hypothesis import given

from secretgraph.asgi import application

schema = schemathesis.graphql.from_asgi(
    "graphql", application, base_url="localhost"
)
base_strategy = schema.as_strategy()


class SchemathesisTests(TestCase):
    @given(case=base_strategy)
    def test_base(self, case):
        response = case.call_asgi()
        case.validate_response(response)
