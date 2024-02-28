import base64
import os
import re

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.test import RequestFactory, TransactionTestCase
from faker import Faker
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.core.utils.crypto import findWorkingAlgorithms, sign
from secretgraph.core.utils.hashing import (
    hashObject,
)
from secretgraph.queries.cluster import clusterFeedQuery, createClusterMutation
from secretgraph.queries.content import contentFeedQuery, createContentMutation
from secretgraph.schema import schema
from secretgraph.server.actions.update import (
    ActionInput,
    ClusterInput,
    ContentInput,
    ContentKeyInput,
    ContentValueInput,
    ReferenceInput,
    create_cluster_fn,
    create_content_fn,
)

_remove_connection = re.compile(r"@connection\(.+?\)", re.MULTILINE | re.DOTALL)


class LoadTests(TransactionTestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

    def _check_for_public_key(self, edges):
        for edge in edges:
            self.assertNotEqual(edge["node"]["type"], "PublicKey")

    async def _queries(self, amount_first_clusters):
        request = self.factory.get("/graphql")
        result = await schema.execute(
            _remove_connection.sub("", clusterFeedQuery),
            {},
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertEqual(
            len(result.data["clusters"]["clusters"]["edges"]),
            amount_first_clusters,
        )
        request = self.factory.get("/graphql")
        result = await schema.execute(
            _remove_connection.sub("", contentFeedQuery),
            {},
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertEqual(
            len(result.data["contents"]["contents"]["edges"]),
            500,
        )
        self._check_for_public_key(result.data["contents"]["contents"]["edges"])
        request = self.factory.get("/graphql")
        result = await schema.execute(
            _remove_connection.sub("", contentFeedQuery),
            {"cursor": result.data["contents"]["contents"]["pageInfo"]["endCursor"]},
            StrawberryDjangoContext(request=request, response=None),
        )
        self._check_for_public_key(result.data["contents"]["contents"]["edges"])
        self.assertEqual(
            len(result.data["contents"]["contents"]["edges"]),
            400,
        )

    async def test_load_single_cluster_single_net_raw(self):
        hash_algos = findWorkingAlgorithms(settings.SECRETGRAPH_HASH_ALGORITHMS, "hash")
        signkey = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pub_signkey = signkey.public_key()
        pub_signkey_bytes = pub_signkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        pub_signKey_hash = await hashObject(pub_signkey_bytes, hash_algos[0])
        faker = Faker()
        request = self.factory.get("/graphql")
        cluster = (
            await (
                await create_cluster_fn(
                    request,
                    ClusterInput(
                        actions=[
                            ActionInput(
                                value={"action": "manage"},
                                key=base64.b64encode(os.urandom(50)).decode(),
                            )
                        ],
                        keys=[ContentKeyInput(publicKey=pub_signkey_bytes)],
                        name="@test",
                    ),
                    authset=[],
                )
            )()
        )["cluster"]

        with self.subTest("setup"):
            for i in range(900):
                request = self.factory.get("/graphql")
                tags = ["name=foo", "mime=text/plain"]
                if i % 20 == 0:
                    content = faker.paragraph(nb_sentences=20).encode()
                    signature = await sign(signkey, content, hash_algos[0])

                await (
                    await create_content_fn(
                        request,
                        ContentInput(
                            net=cluster.net,
                            cluster=cluster,
                            hidden=False,
                            value=ContentValueInput(
                                value=content,
                                state="public",
                                type="Text",
                                tags=tags,
                                references=[
                                    ReferenceInput(
                                        group="signature",
                                        target=pub_signKey_hash,
                                        extra=signature,
                                    )
                                ],
                            ),
                        ),
                        authset=[],
                    )
                )()
        with self.subTest("queries"):
            await self._queries(1)

    async def test_load_multi_cluster_multi_net_raw(self):
        hash_algos = findWorkingAlgorithms(settings.SECRETGRAPH_HASH_ALGORITHMS, "hash")
        signkey = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pub_signkey = signkey.public_key()
        pub_signkey_bytes = pub_signkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        pub_signKey_hash = await hashObject(pub_signkey_bytes, hash_algos[0])
        faker = Faker()

        with self.subTest("setup"):
            for i in range(900):
                # cluster creates also 1 content
                request = self.factory.get("/graphql")
                cluster = (
                    await (
                        await create_cluster_fn(
                            request,
                            ClusterInput(
                                actions=[
                                    ActionInput(
                                        value={"action": "manage"},
                                        key=base64.b64encode(os.urandom(50)).decode(),
                                    )
                                ],
                                keys=[ContentKeyInput(publicKey=pub_signkey_bytes)],
                                name=f"@test{i}",
                            ),
                            authset=[],
                        )
                    )()
                )["cluster"]
                request = self.factory.get("/graphql")
                tags = ["name=foo", "mime=text/plain"]
                if i % 20 == 0:
                    content = faker.paragraph(nb_sentences=20).encode()
                    signature = await sign(signkey, content, hash_algos[0])

                await (
                    await create_content_fn(
                        request,
                        ContentInput(
                            net=cluster.net,
                            cluster=cluster,
                            hidden=False,
                            value=ContentValueInput(
                                value=content,
                                state="public",
                                type="Text",
                                tags=tags,
                                references=[
                                    ReferenceInput(
                                        group="signature",
                                        target=pub_signKey_hash,
                                        extra=signature,
                                    )
                                ],
                            ),
                        ),
                        authset=[],
                    )
                )()
        with self.subTest("queries"):
            await self._queries(500)
