import base64
import json
import logging
import os
from contextlib import redirect_stderr

from asgiref.sync import async_to_sync
from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.core.utils.crypto import (
    buildKeyHashSignature,
    findWorkingAlgorithms,
    generateSignKey,
    splitKeyHashSignature,
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
    def setUp(self):
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
        self.signkey = async_to_sync(generateSignKey)(
            "rsa-sha512", params={"bits": 2048}
        ).key
        self.signature_base_data = f"{self.requester}{self.challenge}".encode("utf8")

    async def test_auth_workflow(self):
        signature = await buildKeyHashSignature(
            self.signkey,
            self.signature_base_data,
            keyAlgorithm="rsa-sha512",
            deriveAlgorithm=self.hash_algos[0],
        )
        fake_signature = await buildKeyHashSignature(
            self.signkey,
            self.signature_base_data + b"sdkdsk",
            keyAlgorithm="rsa-sha512",
            deriveAlgorithm=self.hash_algos[0],
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
                                "signatures": [fake_signature, signature],
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
            lambda x: x.startswith(signature.split(":", 1)[0]),
            node["auth"]["signatures"],
        ):
            signature_tuple = splitKeyHashSignature(signature)
            if await verify(
                self.signkey,
                signature_tuple[1],
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
        signature = await buildKeyHashSignature(
            self.signkey,
            self.signature_base_data,
            keyAlgorithm="rsa-sha512",
            deriveAlgorithm=self.hash_algos[0],
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
                                    "signatures": [signature],
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
                                    "signatures": [signature],
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
        signature = await buildKeyHashSignature(
            self.signkey,
            self.signature_base_data,
            keyAlgorithm="rsa-sha512",
            deriveAlgorithm=self.hash_algos[0],
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
                                "action": "auth",
                                "requester": self.requester,
                                "challenge": self.challenge,
                                "signatures": [signature],
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
                                "signatures": [signature],
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
        signature = await buildKeyHashSignature(
            self.signkey,
            self.signature_base_data,
            keyAlgorithm="rsa-sha512",
            deriveAlgorithm=self.hash_algos[0],
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
                                "action": "auth",
                                "requester": self.requester,
                                "challenge": self.challenge,
                                "signatures": [signature],
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
                                "signatures": [signature],
                            }
                        ),
                        "existingHash": await hashObject(
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
