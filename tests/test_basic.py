import base64
import json
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils
from django.core.files.base import ContentFile
from django.test import RequestFactory, TestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.content import createContentMutation
from secretgraph.schema import schema


class BasicTests(TestCase):
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
        self.assertFalse(result.errors)
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["id"]
        request = self.factory.get("/graphql")
        result = await schema.execute(
            createContentMutation,
            {
                "cluster": clusterid,
                "state": "public",
                "value": ContentFile(b""),
                "type": "File",
                "authorization": f"{clusterid}:${base64.b64encode(manage_token).decode()}",
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)

    async def test_create_cluster_and_content_with_keys(self):
        manage_token = os.urandom(50)
        view_token = os.urandom(50)
        request = self.factory.get("/graphql")
        signkey = rsa.generate_private_key(
            public_exponent=65537, key_size=1024
        )
        nonce_signkey = os.urandom(13)
        nonce_signkey_b64 = base64.b64encode(nonce_signkey).decode("ascii")
        pub_signkey = signkey.public_key()
        pub_signkey_bytes = pub_signkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        encryptkey = rsa.generate_private_key(
            public_exponent=65537, key_size=1024
        )
        nonce_encryptkey = os.urandom(13)
        nonce_encryptkey_b64 = base64.b64encode(nonce_encryptkey).decode(
            "ascii"
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
                        "nonce": nonce_signkey_b64,
                    },
                    {
                        "publicKey": ContentFile(pub_encryptkey_bytes),
                        "publicState": "trusted",
                        "publicTags": ["name=initial encrypt key"],
                        "nonce": nonce_encryptkey_b64,
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
