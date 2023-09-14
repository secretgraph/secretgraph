import base64
import json
from urllib.parse import quote_plus
import os
from contextlib import redirect_stderr

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TransactionTestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.asgi import application
from secretgraph.core.utils.hashing import (
    findWorkingHashAlgorithms,
    hashObject,
)
from secretgraph.core.utils.verification import verify
from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.content import createContentMutation
from secretgraph.queries.key import createKeysMutation
from secretgraph.schema import schema
from secretgraph.server.models import Cluster, Content


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
        self.assertEqual(
            await Cluster.objects.exclude(name="@system").acount(), 1
        )
        self.assertEqual(await Content.objects.acount(), 0)
        self.assertFalse(result.errors)
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["id"]
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
            encryptkey = rsa.generate_private_key(
                public_exponent=65537, key_size=2048
            )
            pub_encryptkey = encryptkey.public_key()
            pub_encryptkey_bytes = pub_encryptkey.public_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            request = self.factory.get("/graphql")
            result = await schema.execute(
                createKeysMutation,
                {
                    "cluster": clusterid,
                    "publicState": "public",
                    "publicKey": ContentFile(pub_encryptkey_bytes),
                    "publicTags": [],
                    "authorization": (
                        f"{clusterid}:${base64.b64encode(manage_token).decode()}",
                    ),
                },
                StrawberryDjangoContext(request=request, response=None),
            )
            self.assertTrue(result.data)
        self.assertEqual(
            await Cluster.objects.exclude(name="@system").acount(), 1
        )
        # one public key is created
        self.assertEqual(await Content.objects.acount(), 1)

    async def test_create_cluster_and_content_with_keys(self):
        manage_token = os.urandom(50)
        view_token = os.urandom(50)
        request = self.factory.get("/graphql")
        signkey = rsa.generate_private_key(
            public_exponent=65537, key_size=2048
        )
        pub_signkey = signkey.public_key()
        pub_signkey_bytes = pub_signkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        # 1024 is too small and could not be used for OAEP
        encryptkey = rsa.generate_private_key(
            public_exponent=65537, key_size=2048
        )
        pub_encryptkey = encryptkey.public_key()
        pub_encryptkey_bytes = pub_encryptkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
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
                        "publicKey": ContentFile(pub_signkey_bytes),
                        "publicState": "public",
                        "publicTags": ["name=initial sign key"],
                    },
                    {
                        "publicKey": ContentFile(pub_encryptkey_bytes),
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

        clusterid = result.data["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["id"]

        hash_algos = findWorkingHashAlgorithms(
            settings.SECRETGRAPH_HASH_ALGORITHMS
        )
        content = os.urandom(100)
        content_shared_key = os.urandom(32)
        content_nonce = os.urandom(13)
        encrypted_content = AESGCM(content_shared_key).encrypt(
            content_nonce, content, None
        )

        hash_ctx = hashes.Hash(hash_algos[0].algorithm)
        hash_ctx.update(encrypted_content)
        encrypted_content_hash_raw = hash_ctx.finalize()
        signature = signkey.sign(
            encrypted_content_hash_raw,
            padding.PSS(
                mgf=padding.MGF1(hash_algos[0].algorithm),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            utils.Prehashed(hash_algos[0].algorithm),
        )

        content_shared_key_enc = pub_encryptkey.encrypt(
            content_shared_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hash_algos[0].algorithm),
                algorithm=hash_algos[0].algorithm,
                label=None,
            ),
        )

        pub_encryptKey_hash = hashObject(pub_encryptkey_bytes, hash_algos[0])
        pub_signKey_hash = hashObject(pub_signkey_bytes, hash_algos[0])
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
                    "extra": "{}:{}".format(
                        hash_algos[0].serializedName,
                        base64.b64encode(content_shared_key_enc).decode(
                            "ascii"
                        ),
                    ),
                },
                {
                    "group": "signature",
                    "target": pub_signKey_hash,
                    "extra": "{}:{}".format(
                        hash_algos[0].serializedName,
                        base64.b64encode(signature).decode("ascii"),
                    ),
                },
            ],
            "value": ContentFile(encrypted_content),
            "nonce": base64.b64encode(content_nonce).decode(),
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
            path = result.data["secretgraph"]["updateOrCreateContent"][
                "content"
            ]["link"]
            item_id = result.data["secretgraph"]["updateOrCreateContent"][
                "content"
            ]["id"]
            url = f"http://{request.get_host()}{path}"

        self.assertEqual(
            await Cluster.objects.exclude(name="@system").acount(), 1
        )
        self.assertEqual(await Content.objects.acount(), 3)
        self.assertTrue(url)
        with self.subTest("check signature without item"):
            client = httpx.AsyncClient(app=application)
            # NOTE: quote_plus is required for urlencoding
            rets, errors = await verify(
                client,
                f"{url}?token={quote_plus(m_token)}",
                exit_first=True,
            )
            print(errors)
            self.assertEqual(len(rets), 1)
        self.assertTrue(item_id)
        with self.subTest("check signature with item"):
            client = httpx.AsyncClient(app=application)
            # NOTE: quote_plus is required for urlencoding
            rets, errors = await verify(
                client,
                f"{url}?token={quote_plus(m_token)}&item={quote_plus(item_id)}",
                exit_first=True,
            )
            print(errors)
            self.assertEqual(len(rets), 1)
