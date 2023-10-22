import asyncio
import base64
import os
import re

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TransactionTestCase
from faker import Faker
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.asgi import application
from secretgraph.core.utils.hashing import (
    findWorkingHashAlgorithms,
    hashObject,
)
from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.content import contentFeedQuery, createContentMutation
from secretgraph.queries.key import createKeysMutation
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

_remove_connection = re.compile(
    r"@connection\(.+?\)", re.MULTILINE | re.DOTALL
)


class LoadTests(TransactionTestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

    async def _queries(self):
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
        request = self.factory.get("/graphql")
        result = await schema.execute(
            _remove_connection.sub("", contentFeedQuery),
            {
                "cursor": result.data["contents"]["contents"]["pageInfo"][
                    "endCursor"
                ]
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        # include sign key
        self.assertEqual(
            len(result.data["contents"]["contents"]["edges"]),
            401,
        )

    def test_load_single_cluster_single_net_raw(self):
        hash_algos = findWorkingHashAlgorithms(
            settings.SECRETGRAPH_HASH_ALGORITHMS
        )
        signkey = rsa.generate_private_key(
            public_exponent=65537, key_size=2048
        )
        pub_signkey = signkey.public_key()
        pub_signkey_bytes = pub_signkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        pub_signKey_hash = hashObject(pub_signkey_bytes, hash_algos[0])
        request = self.factory.get("/graphql")
        cluster = create_cluster_fn(
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
        )()["cluster"]
        faker = Faker()

        with self.subTest("setup"):
            for i in range(900):
                request = self.factory.get("/graphql")
                tags = ["name=foo", "mime=text/plain"]
                if i % 20 == 0:
                    content = faker.paragraph(nb_sentences=20).encode()
                    signature = signkey.sign(
                        content,
                        padding.PSS(
                            mgf=padding.MGF1(hash_algos[0].algorithm),
                            salt_length=padding.PSS.MAX_LENGTH,
                        ),
                        hash_algos[0].algorithm,
                    )

                create_content_fn(
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
                                    extra="{}:{}".format(
                                        hash_algos[0].serializedName,
                                        base64.b64encode(signature).decode(
                                            "ascii"
                                        ),
                                    ),
                                )
                            ],
                        ),
                    ),
                    authset=[],
                )()
        with self.subTest("queries"):
            asyncio.run(self._queries())
