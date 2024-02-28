import base64
import json
import logging
import os
from contextlib import redirect_stderr

from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.core.utils.crypto import (
    findWorkingAlgorithms,
    generateEncryptionKey,
    generateSignKey,
    hashKey,
    sign,
    toPublicKey,
    verify,
)
from secretgraph.core.utils.hashing import (
    hashObject,
)
from secretgraph.queries.cluster import (
    createClusterMutation,
    updateClusterMutation,
)
from secretgraph.queries.node import authQuery
from secretgraph.schema import schema
from secretgraph.server.models import Action


class AuthTests(TestCase):
    async def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

        self.manage_token = os.urandom(50)
        self.view_token = os.urandom(50)
        self.auth_token = os.urandom(50)
        self.challenge = base64.b64encode(os.urandom(50)).decode()
        self.requester = "https://example.com"

        self.hash_algos = findWorkingAlgorithms(
            settings.SECRETGRAPH_HASH_ALGORITHMS, "hash"
        )
        self.signkey = await generateSignKey("rsa-sha512", params={"bits": 2048})
        self.signature_base_data = f"{self.requester}{self.challenge}".encode("utf8")
        self.signature = await sign(
            self.signkey,
            self.signature_base_data,
            self.hash_algos[0],
        )

    async def test_auth_workflow(self):
        fake_signature = await sign(
            self.signkey,
            self.signature_base_data + b"sdkdsk",
            self.hash_algos[0],
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
                        "publicKey": ContentFile(
                            (
                                await toPublicKey(self.signkey, "rsa-sha512", sign=True)
                            ).key
                        ),
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
                                "signatures": [fake_signature, self.signature],
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
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"]["cluster"]["id"]
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
        invalid_signature_found = False
        for signature in filter(
            lambda x: x.startswith(self.pub_signKey_hash),
            node["auth"]["signatures"],
        ):
            # strip hash prefix and decode
            signature = base64.b64decode(signature.rsplit(":", 1)[-1])
            if verify(
                self.signkey,
                signature,
                f'{node["auth"]["requester"]}{node["auth"]["challenge"]}'.encode(
                    "utf8"
                ),
            ):
                valid_signature_found = True
            else:
                invalid_signature_found = True
        self.assertTrue(valid_signature_found)
        self.assertTrue(invalid_signature_found)

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
                            "publicKey": ContentFile(
                                (
                                    await toPublicKey(
                                        self.signkey, "rsa-sha512", sign=True
                                    )
                                ).key
                            ),
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
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"]["cluster"]["id"]
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
        clusterid = result.data["secretgraph"]["updateOrCreateCluster"]["cluster"]["id"]
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
