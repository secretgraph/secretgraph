import base64
import json
import os
from contextlib import redirect_stderr

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.core.utils.hashing import (
    findWorkingHashAlgorithms,
    hashObject,
)
from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.node import authQuery
from secretgraph.schema import schema
from secretgraph.server.models import Action


class AuthTests(TestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

    async def test_auth_workflow(self):
        manage_token = os.urandom(50)
        view_token = os.urandom(50)
        auth_token = os.urandom(50)
        challenge = base64.b64encode(os.urandom(50)).decode()
        requester = "https://example.com"

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
        signature_base_data = f"{requester}{challenge}".encode("utf8")
        signature = signkey.sign(
            signature_base_data,
            padding.PSS(
                mgf=padding.MGF1(hash_algos[0].algorithm),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hash_algos[0].algorithm,
        )
        fake_signature = signkey.sign(
            signature_base_data + b"sdkdsk",
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
                                "requester": requester,
                                "challenge": challenge,
                                "signatures": [
                                    f"{pub_signKey_hash}:{base64.b64encode(fake_signature).decode()}",
                                    f"{pub_signKey_hash}:{base64.b64encode(signature).decode()}",
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
        self.assertEqual(await Action.objects.acount(), 4)

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
        self.assertTrue(node["auth"])
        valid_signature_found = False
        raised_for_invalid_signature = False
        for signature in filter(
            lambda x: x.startswith(pub_signKey_hash),
            node["auth"]["signatures"],
        ):
            # strip hash prefix and decode
            signature = base64.b64decode(signature.rsplit(":", 1)[-1])
            try:
                pub_signkey.verify(
                    signature,
                    f'{node["auth"]["requester"]}{node["auth"]["challenge"]}'.encode(
                        "utf8"
                    ),
                    padding.PSS(
                        mgf=padding.MGF1(hash_algos[0].algorithm),
                        salt_length=padding.PSS.MAX_LENGTH,
                    ),
                    hash_algos[0].algorithm,
                )
                valid_signature_found = True
            except InvalidSignature:
                raised_for_invalid_signature = True
        self.assertTrue(valid_signature_found)
        self.assertTrue(raised_for_invalid_signature)

    async def test_fail_double_auth(self):
        manage_token = os.urandom(50)
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
        with redirect_stderr(None):
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
                    ],
                },
                StrawberryDjangoContext(request=request, response=None),
            )
        self.assertTrue(result.errors)
