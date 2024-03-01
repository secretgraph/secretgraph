import base64
import json
import os
from contextlib import redirect_stderr
from urllib.parse import quote_plus

import httpx
from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TransactionTestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.asgi import application
from secretgraph.core.utils.crypto import (
    encrypt,
    encryptString,
    findWorkingAlgorithms,
    generateEncryptionKey,
    generateSignKey,
    getSignatureHasher,
    serializeEncryptionParams,
    sign,
    toPublicKey,
)
from secretgraph.core.utils.hashing import (
    hashObject,
)
from secretgraph.core.utils.verification import verify_content
from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.content import createContentMutation
from secretgraph.queries.key import createKeysMutation
from secretgraph.schema import schema
from secretgraph.server.models import Cluster, Content


# verify_content requires TransactionTestCase
class BasicTests(TransactionTestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

    async def test_create_cluster_and_content(self):
        manage_token = os.urandom(50)
        view_token = os.urandom(50)
        request = self.factory.get("/graphql")
        result = await schema.execute(
            createClusterMutation,
            {
                "name": "test",
                "description": "test description",
                "featured": True,
                "primary": True,
                "actions": [
                    {
                        "value": '{"action": "manage"}',
                        "key": base64.b64encode(manage_token).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "view",
                                "includeTypes": [
                                    "PublicKey",
                                    "PrivateKey",
                                    "Config",
                                ],
                                "includeTags": [
                                    "slot=main",
                                ],
                            }
                        ),
                        "key": base64.b64encode(view_token).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertEqual(await Cluster.objects.exclude(name="@system").acount(), 1)
        self.assertEqual(await Content.objects.acount(), 0)
        self.assertFalse(result.errors)
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"]["cluster"]["id"]
        with self.subTest("Fail because content is not signed"):
            request = self.factory.get("/graphql")
            with redirect_stderr(None):
                result = await schema.execute(
                    createContentMutation,
                    {
                        "cluster": clusterid,
                        "state": "public",
                        "value": ContentFile(b""),
                        "type": "File",
                        "authorization": (
                            f"{clusterid}:${base64.b64encode(manage_token).decode()}"
                        ),
                        "tags": [],
                    },
                    StrawberryDjangoContext(request=request, response=None),
                )
            self.assertTrue(result.errors)
        with self.subTest("Allow bootstrapping"):
            encryptkey = await generateEncryptionKey("rsa-sha512", {"bits": 2048})
            pub_encryptkey = await toPublicKey(
                encryptkey.key, algorithm="rsa-sha512", sign=False
            )
            request = self.factory.get("/graphql")
            result = await schema.execute(
                createKeysMutation,
                {
                    "cluster": clusterid,
                    "publicState": "public",
                    "publicKey": ContentFile(pub_encryptkey.key),
                    "publicTags": [],
                    "authorization": (
                        f"{clusterid}:${base64.b64encode(manage_token).decode()}",
                    ),
                },
                StrawberryDjangoContext(request=request, response=None),
            )
            self.assertTrue(result.data)
        self.assertEqual(await Cluster.objects.exclude(name="@system").acount(), 1)
        # one public key is created
        self.assertEqual(await Content.objects.acount(), 1)

    async def test_create_cluster_and_content_with_keys(self):
        manage_token = os.urandom(50)
        view_token = os.urandom(50)
        request = self.factory.get("/graphql")
        signkey = await generateSignKey("rsa-sha512", {"bits": 2048})
        pub_signkey = await toPublicKey(
            signkey.key, algorithm=signkey.serializedName, sign=True
        )
        # 1024 is too small and could not be used for OAEP
        encryptkey = await generateEncryptionKey("rsa-sha512", {"bits": 2048})
        pub_encryptkey = await toPublicKey(
            encryptkey.key, algorithm=encryptkey.serializedName, sign=False
        )

        result = await schema.execute(
            createClusterMutation,
            {
                "name": "test",
                "description": "test description",
                "featured": True,
                "primary": True,
                "keys": [
                    {
                        "publicKey": ContentFile(pub_signkey.key),
                        "publicState": "public",
                        "publicTags": ["name=initial sign key"],
                    },
                    {
                        "publicKey": ContentFile(pub_encryptkey.key),
                        "publicState": "trusted",
                        "publicTags": ["name=initial encrypt key"],
                    },
                ],
                "actions": [
                    {
                        "value": '{"action": "manage"}',
                        "key": base64.b64encode(manage_token).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "view",
                                "includeTypes": [
                                    "PublicKey",
                                    "PrivateKey",
                                    "Config",
                                ],
                                "includeTags": [
                                    "slot=main",
                                ],
                            }
                        ),
                        "key": base64.b64encode(view_token).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )

        clusterid = result.data["secretgraph"]["updateOrCreateCluster"]["cluster"]["id"]

        hash_algos = findWorkingAlgorithms(settings.SECRETGRAPH_HASH_ALGORITHMS, "hash")
        content = os.urandom(100)
        content_shared_key = os.urandom(32)
        encrypted_content = await encrypt(
            content_shared_key, content, algorithm="AESGCM"
        )

        hash_ctx = await getSignatureHasher("rsa-sha512")
        hash_ctx.update(encrypted_content.data)
        encrypted_content_hash_raw = hash_ctx.finalize()
        signature = await sign(
            signkey.key,
            encrypted_content_hash_raw,
            algorithm="rsa-sha512",
            prehashed=True,
        )

        pub_encryptKey_hash = await hashObject(pub_encryptkey.key, hash_algos[0])
        pub_signKey_hash = await hashObject(pub_signkey.key, hash_algos[0])
        m_token = f"{clusterid}:{base64.b64encode(manage_token).decode()}"
        prepared_content = {
            "cluster": clusterid,
            "type": "File",
            "state": "protected",
            "tags": [
                "name=foo",
                "mime=application/octet-stream",
                "key_hash={}".format(pub_encryptKey_hash),
            ],
            "references": [
                {
                    "group": "key",
                    "target": pub_encryptKey_hash,
                    "extra": await encryptString(
                        pub_encryptkey.key, content_shared_key, algorithm="rsa-sha512"
                    ),
                },
                {
                    "group": "signature",
                    "target": pub_signKey_hash,
                    "extra": signature,
                },
            ],
            "value": ContentFile(encrypted_content.data),
            "cryptoParameters": await serializeEncryptionParams(
                encrypted_content.params, algorithm=encrypted_content.serializedName
            ),
            "authorization": [m_token],
        }
        url = ""
        item_id = ""
        with self.subTest("Succeed because content is signed"):
            request = self.factory.get("/graphql")
            result = await schema.execute(
                createContentMutation,
                prepared_content,
                StrawberryDjangoContext(request=request, response=None),
            )
            self.assertFalse(result.errors)
            self.assertTrue(result.data)
            self.assertTrue(
                result.data["secretgraph"]["updateOrCreateContent"]["writeok"]
            )
            path = result.data["secretgraph"]["updateOrCreateContent"]["content"][
                "link"
            ]
            item_id = result.data["secretgraph"]["updateOrCreateContent"]["content"][
                "id"
            ]
            url = f"http://{request.get_host()}{path}"

        self.assertEqual(await Cluster.objects.exclude(name="@system").acount(), 1)
        self.assertEqual(await Content.objects.acount(), 3)
        self.assertTrue(url)
        with self.subTest("check signature without item"):
            client = httpx.AsyncClient(app=application)
            # NOTE: quote_plus is required for urlencoding
            rets, errors = await verify_content(
                client,
                f"{url}?token={quote_plus(m_token)}",
                exit_first=True,
            )
            self.assertEqual(len(rets), 1)
        self.assertTrue(item_id)
        with self.subTest("check signature with item"):
            client = httpx.AsyncClient(app=application)
            # NOTE: quote_plus is required for urlencoding
            rets, errors = await verify_content(
                client,
                f"{url}?token={quote_plus(m_token)}&item={quote_plus(item_id)}",
                exit_first=True,
                force_item=True,
            )
            self.assertEqual(len(rets), 1)
