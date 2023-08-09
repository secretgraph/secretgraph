import base64
import json
import logging
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
from secretgraph.queries.cluster import (
    createClusterMutation,
    updateClusterMutation,
)
from secretgraph.queries.node import authQuery
from secretgraph.schema import schema
from secretgraph.server.models import Action
from secretgraph.server.signals import sweepOutdated


class AuthTests(TestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

        self.manage_token = os.urandom(50)
        self.view_token = os.urandom(50)
        self.auth_token = os.urandom(50)
        self.challenge = base64.b64encode(os.urandom(50)).decode()
        self.requester = "https://example.com"

        self.hash_algos = findWorkingHashAlgorithms(
            settings.SECRETGRAPH_HASH_ALGORITHMS
        )
        self.signkey = rsa.generate_private_key(
            public_exponent=65537, key_size=2048
        )
        self.pub_signkey = self.signkey.public_key()
        self.pub_signkey_bytes = self.pub_signkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.pub_signKey_hash = hashObject(
            self.pub_signkey_bytes, self.hash_algos[0]
        )
        self.signature_base_data = f"{self.requester}{self.challenge}".encode(
            "utf8"
        )
        self.signature = self.signkey.sign(
            self.signature_base_data,
            padding.PSS(
                mgf=padding.MGF1(self.hash_algos[0].algorithm),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            self.hash_algos[0].algorithm,
        )

    async def test_auth_workflow(self):
        fake_signature = self.signkey.sign(
            self.signature_base_data + b"sdkdsk",
            padding.PSS(
                mgf=padding.MGF1(self.hash_algos[0].algorithm),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            self.hash_algos[0].algorithm,
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
                        "publicKey": ContentFile(self.pub_signkey_bytes),
                        "publicState": "public",
                        "publicTags": ["name=initial sign key"],
                    },
                ],
                "actions": [
                    {
                        "value": '{"action": "manage"}',
                        "key": base64.b64encode(self.manage_token).decode(),
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
                        "key": base64.b64encode(self.view_token).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "auth",
                                "requester": self.requester,
                                "challenge": self.challenge,
                                "signatures": [
                                    f"{self.pub_signKey_hash}:{base64.b64encode(fake_signature).decode()}",
                                    f"{self.pub_signKey_hash}:{base64.b64encode(self.signature).decode()}",
                                ],
                            }
                        ),
                        "key": base64.b64encode(self.auth_token).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "view",
                            }
                        ),
                        "key": base64.b64encode(self.auth_token).decode(),
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
                "authorization": f"{clusterid}:{base64.b64encode(self.auth_token).decode()}",
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)
        node = result.data["secretgraph"]["node"]
        self.assertTrue(node["auth"])
        valid_signature_found = False
        raised_for_invalid_signature = False
        for signature in filter(
            lambda x: x.startswith(self.pub_signKey_hash),
            node["auth"]["signatures"],
        ):
            # strip hash prefix and decode
            signature = base64.b64decode(signature.rsplit(":", 1)[-1])
            try:
                self.pub_signkey.verify(
                    signature,
                    f'{node["auth"]["requester"]}{node["auth"]["challenge"]}'.encode(
                        "utf8"
                    ),
                    padding.PSS(
                        mgf=padding.MGF1(self.hash_algos[0].algorithm),
                        salt_length=padding.PSS.MAX_LENGTH,
                    ),
                    self.hash_algos[0].algorithm,
                )
                valid_signature_found = True
            except InvalidSignature:
                raised_for_invalid_signature = True
        self.assertTrue(valid_signature_found)
        self.assertTrue(raised_for_invalid_signature)

    async def test_fail_double_auth_same_request(self):
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
                            "publicKey": ContentFile(self.pub_signkey_bytes),
                            "publicState": "public",
                            "publicTags": ["name=initial sign key"],
                        },
                    ],
                    "actions": [
                        {
                            "value": '{"action": "manage"}',
                            "key": base64.b64encode(
                                self.manage_token
                            ).decode(),
                        },
                        {
                            "value": json.dumps(
                                {
                                    "action": "auth",
                                    "requester": self.requester,
                                    "challenge": self.challenge,
                                    "signatures": [
                                        f"{self.hash_algos[0].serializedName}:{self.pub_signKey_hash}:{base64.b64encode(self.signature).decode()}"
                                    ],
                                }
                            ),
                            "key": base64.b64encode(self.auth_token).decode(),
                        },
                        {
                            "value": json.dumps(
                                {
                                    "action": "auth",
                                    "requester": self.requester,
                                    "challenge": self.challenge,
                                    "signatures": [
                                        f"{self.hash_algos[0].serializedName}:{self.pub_signKey_hash}:{base64.b64encode(self.signature).decode()}"
                                    ],
                                }
                            ),
                            "key": base64.b64encode(self.auth_token).decode(),
                        },
                    ],
                },
                StrawberryDjangoContext(request=request, response=None),
            )
        self.assertTrue(result.errors)

    async def test_warn_multiple_auth_instances(self):
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
                        "publicKey": ContentFile(self.pub_signkey_bytes),
                        "publicState": "public",
                        "publicTags": ["name=initial sign key"],
                    },
                ],
                "actions": [
                    {
                        "value": '{"action": "manage"}',
                        "key": base64.b64encode(self.manage_token).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "auth",
                                "requester": self.requester,
                                "challenge": self.challenge,
                                "signatures": [
                                    f"{self.hash_algos[0].serializedName}:{self.pub_signKey_hash}:{base64.b64encode(self.signature).decode()}"
                                ],
                            }
                        ),
                        "key": base64.b64encode(self.auth_token).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["id"]
        clusterupdateid = result.data["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["updateId"]

        request = self.factory.get("/graphql")
        result = await schema.execute(
            updateClusterMutation,
            {
                "id": clusterid,
                "updateId": clusterupdateid,
                "authorization": f"{clusterid}:{base64.b64encode(self.manage_token).decode()}",
                "actions": [
                    {
                        "value": json.dumps(
                            {
                                "action": "auth",
                                "requester": self.requester,
                                "challenge": self.challenge,
                                "signatures": [
                                    f"{self.hash_algos[0].serializedName}:{self.pub_signKey_hash}:{base64.b64encode(self.signature).decode()}"
                                ],
                            }
                        ),
                        "key": base64.b64encode(self.auth_token).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        request = self.factory.get("/graphql")
        with self.assertLogs(level=logging.WARNING):
            result = await schema.execute(
                authQuery,
                {
                    "id": clusterid,
                    "authorization": f"{clusterid}:{base64.b64encode(self.auth_token).decode()}",
                },
                StrawberryDjangoContext(request=request, response=None),
            )
        self.assertFalse(result.errors)

    async def test_replace_auth(self):
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
                        "publicKey": ContentFile(self.pub_signkey_bytes),
                        "publicState": "public",
                        "publicTags": ["name=initial sign key"],
                    },
                ],
                "actions": [
                    {
                        "value": '{"action": "manage"}',
                        "key": base64.b64encode(self.manage_token).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "auth",
                                "requester": self.requester,
                                "challenge": self.challenge,
                                "signatures": [
                                    f"{self.hash_algos[0].serializedName}:{self.pub_signKey_hash}:{base64.b64encode(self.signature).decode()}"
                                ],
                            }
                        ),
                        "key": base64.b64encode(self.auth_token).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["id"]
        clusterupdateid = result.data["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["updateId"]

        request = self.factory.get("/graphql")
        result = await schema.execute(
            updateClusterMutation,
            {
                "id": clusterid,
                "updateId": clusterupdateid,
                "authorization": f"{clusterid}:{base64.b64encode(self.manage_token).decode()}",
                "actions": [
                    {
                        "value": json.dumps(
                            {
                                "action": "auth",
                                "requester": self.requester,
                                "challenge": self.challenge,
                                "signatures": [
                                    f"{self.hash_algos[0].serializedName}:{self.pub_signKey_hash}:{base64.b64encode(self.signature).decode()}"
                                ],
                            }
                        ),
                        "existingHash": hashObject(
                            (b"secretgraph", self.auth_token),
                            self.hash_algos[0],
                        ),
                        "key": base64.b64encode(self.auth_token).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )
        request = self.factory.get("/graphql")
        with self.assertNoLogs(level=logging.WARNING):
            result = await schema.execute(
                authQuery,
                {
                    "id": clusterid,
                    "authorization": f"{clusterid}:{base64.b64encode(self.auth_token).decode()}",
                },
                StrawberryDjangoContext(request=request, response=None),
            )
        self.assertFalse(result.errors)
