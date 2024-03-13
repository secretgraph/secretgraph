import re
import typing
from datetime import timedelta as td
from pprint import pprint
from random import randrange

import schemathesis
from graphql import FieldNode, IntValueNode, NullValueNode, StringValueNode
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from hypothesis.extra.django import TransactionTestCase
from schemathesis.graphql import nodes
from strawberry.file_uploads import Upload
from strawberry.relay import to_base64
from strawberry.scalars import JSON

from secretgraph.asgi import application

_invalid_fields = re.compile(r'(?:before|after): "')


@st.composite
def global_id_strategy(draw: st.DrawFn):
    prefix = draw(st.sampled_from(["Cluster", "Content"]))
    is_real = draw(st.booleans())
    if is_real:
        if prefix == "Content":
            # BROKEN: we need a better fixture
            uuid = draw(st.sampled_from(["3155509f-5006-4d2a-839e-0a290f19bc25"]))
        else:
            # BROKEN: we need a better fixture
            uuid = draw(st.sampled_from(["3155509f-5006-4d2a-839e-0a290f19bc25"]))
    else:
        uuid = draw(st.uuids())
    return nodes.String(to_base64(prefix, str(uuid)))


@st.composite
def local_global_id_strategy(draw: st.DrawFn):
    prefix = draw(st.sampled_from(["Cluster", "Content"]))
    is_real = draw(st.booleans())
    if is_real:
        if prefix == "Content":
            # BROKEN: we need a better fixture
            uuid = draw(st.sampled_from(["3155509f-5006-4d2a-839e-0a290f19bc25"]))
        else:
            # BROKEN: we need a better fixture
            uuid = draw(st.sampled_from(["3155509f-5006-4d2a-839e-0a290f19bc25"]))
    else:
        uuid = draw(st.uuids())
    is_local = draw(st.booleans())
    if is_local:
        return nodes.String(str(uuid))
    return nodes.String(to_base64(prefix, str(uuid)))


@st.composite
def upload_strategy(draw: st.DrawFn):
    bob = draw(st.binary(max_size=500))
    return Upload(bob)


# TODO: not a good strategy
@st.composite
def json_strategy(draw: st.DrawFn):
    return JSON({"action": draw(st.sampled_from(["manage", "admin", "view"]))})


schemathesis.graphql.scalar("GlobalID", global_id_strategy())
schemathesis.graphql.scalar("ID", global_id_strategy())
schemathesis.graphql.scalar("Int", st.integers(0, 500).map(nodes.Int))
schemathesis.graphql.scalar("Upload", upload_strategy())
schemathesis.graphql.scalar("JSON", json_strategy())
schema = schemathesis.graphql.from_asgi("/graphql/", application)


def recursive_exclude(node):
    pass


def recursive_change(node):
    if getattr(node, "name", None):
        node_name = node.name.value
        try:
            if node_name in {"before", "after"} and isinstance(
                node.value, StringValueNode
            ):
                node.value = NullValueNode()
            # readstatistics
            if not isinstance(node, FieldNode):
                if node_name in {"first", "last"} and isinstance(
                    node.value, IntValueNode
                ):
                    if int(node.value.value) < 0:
                        node.value.value = str(randrange(1, 500))
        except Exception as exc:
            print(exc)
    if getattr(node, "arguments", None):
        for subnode in node.arguments:
            recursive_change(subnode)
    if getattr(node, "selection_set", None) and getattr(
        node.selection_set, "selections", None
    ):
        for subnode in node.selection_set.selections:
            recursive_change(subnode)


@schema.hook
def map_body(context, body):
    recursive_change(body.definitions[0])
    return body


class SchemathesisTests(TransactionTestCase):
    fixtures = ["test_db.json"]

    @given(case=schema["Query"].as_strategy())
    @settings(
        suppress_health_check=(HealthCheck.too_slow,),
        deadline=td(milliseconds=500),
        max_examples=80,
    )
    def test_queries(self, case):
        try:
            response = case.call_asgi()
        except Exception as exc:
            pprint(exc)
            pprint(case.body)
            return

        if response.status_code != 200:
            pprint(case.body)
            print(response.content)
            self.fail("response returned wrong status code")
        jsonob = response.json()
        if jsonob.get("errors"):
            for error in jsonob["errors"]:
                if "Query too compley" not in error["message"]:
                    pprint(case.body)
                    pprint(jsonob["errors"])
                    self.fail("errors detected")

    @given(case=schema["Mutation"].as_strategy())
    @settings(
        suppress_health_check=(HealthCheck.too_slow,),
        deadline=td(milliseconds=500),
        max_examples=80,
    )
    def test_mutations(self, case):
        try:
            response = case.call_asgi()
        except Exception as exc:
            pprint(exc)
            pprint(case.body)
            return

        if response.status_code != 200:
            pprint(case.body)
            print(response.content)
            self.fail("response returned wrong status code")
        jsonob = response.json()
        if jsonob.get("errors"):
            for error in jsonob["errors"]:
                if "Query too compley" not in error["message"]:
                    pprint(case.body)
                    pprint(jsonob["errors"])
                    self.fail("errors detected")
