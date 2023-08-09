import base64
import json
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.core.utils.hashing import (
    findWorkingHashAlgorithms,
    hashObject,
)
from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.key import createKeysMutation
from secretgraph.queries.node import authQuery
from secretgraph.schema import schema


class BasicTests(TestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

    async def test_create_cluster_and_auth(self):
        manage_token = os.urandom(50)
        view_token = os.urandom(50)
        auth_token = os.urandom(50)
        challenge = base64.b64encode(os.urandom(50)).decode()

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
        signature = signkey.sign(
            challenge.encode("utf8"),
            padding.PSS(
                mgf=padding.MGF1(hash_algos[0].algorithm),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hash_algos[0].algorithm,
        )

        request = self.factory.get("/graphql")
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
                    {
                        "value": json.dumps(
                            {
                                "action": "auth",
                                "requester": "https://example.com",
                                "challenge": challenge,
                                "signatures": [
                                    f"{hash_algos[0].serializedName}:{pub_signKey_hash}:{base64.b64encode(signature).decode()}"
                                ],
                            }
                        ),
                        "key": base64.b64encode(auth_token).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "view",
                            }
                        ),
                        "key": base64.b64encode(auth_token).decode(),
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
            authQuery,
            {
                "id": clusterid,
                "authorization": f"{clusterid}:{base64.b64encode(auth_token).decode()}",
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)
        node = result.data["secretgraph"]["node"]
        print(node)
