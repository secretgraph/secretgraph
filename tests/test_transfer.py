import base64
import json
import os

from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TransactionTestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.core.constants import TransferResult
from secretgraph.core.utils.crypto import (
    decryptString,
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
from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.content import createContentMutation, transferMutation
from secretgraph.schema import schema
from secretgraph.server.actions.update import transfer_value
from secretgraph.server.models import Content
from secretgraph.server.signals import sweepOutdated


class TransferTests(TransactionTestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

    async def _prepare(self):
        manage_token = os.urandom(50)
        view_token_raw = os.urandom(50)
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
                f"key_hash={pub_encryptKey_hash}",
            ],
            "actions": [
                {
                    "value": json.dumps({"action": "view", "fetch": True}),
                    "key": base64.b64encode(view_token_raw).decode(),
                },
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
                encrypted_content.params, encrypted_content.serializedName
            ),
            "authorization": [m_token],
        }
        request = self.factory.get("/graphql")
        result = await schema.execute(
            createContentMutation,
            prepared_content,
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)
        self.assertTrue(result.data)
        self.assertTrue(result.data["secretgraph"]["updateOrCreateContent"]["writeok"])
        content_id = result.data["secretgraph"]["updateOrCreateContent"]["content"][
            "id"
        ]
        path = result.data["secretgraph"]["updateOrCreateContent"]["content"]["link"]
        url = f"http://{request.get_host()}{path}"
        transfer_shared_key = os.urandom(32)
        encrypted_url_tag = await encryptString(
            transfer_shared_key, url.encode("utf8"), algorithm="AESGCM"
        )
        header = f"Authorization={clusterid}:{base64.b64encode(view_token_raw).decode('ascii')}"
        encrypted_header_tag = await encryptString(
            transfer_shared_key, header.encode("utf8"), algorithm="AESGCM"
        )
        transfer_shared_key_enc = await encrypt(
            pub_encryptkey, transfer_shared_key, algorithm="rsa-sha512"
        )

        prepared_transfer = {
            "cluster": clusterid,
            "type": "File",
            "state": "protected",
            "tags": [
                "name=foo",
                f"~transfer_url={encrypted_url_tag}",
                f"~transfer_header={encrypted_header_tag}",
                f"key_hash={pub_encryptKey_hash}",
            ],
            "references": [
                {"group": "signature", "target": pub_signKey_hash, "extra": signature},
                {
                    "group": "transfer",
                    "target": pub_encryptKey_hash,
                    "extra": "{}:{}".format(
                        await serializeEncryptionParams(
                            transfer_shared_key_enc.params,
                            transfer_shared_key_enc.serializedName,
                        ),
                        base64.b64encode(transfer_shared_key_enc.data).decode("ascii"),
                    ),
                },
            ],
            "value": ContentFile(b""),
            "cryptoParameters": await serializeEncryptionParams(
                transfer_shared_key_enc.params, transfer_shared_key_enc.serializedName
            ),
            "authorization": [m_token],
        }
        result = await schema.execute(
            createContentMutation,
            prepared_transfer,
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)
        self.assertTrue(result.data)
        self.assertTrue(result.data["secretgraph"]["updateOrCreateContent"]["writeok"])
        transfer_id = result.data["secretgraph"]["updateOrCreateContent"]["content"][
            "id"
        ]
        return (
            m_token,
            content_shared_key,
            transfer_shared_key,
            content_id,
            transfer_id,
        )

    async def test_transfer_intern(self):
        (
            manage_token,
            content_key,
            transfer_key,
            content_id,
            transfer_id,
        ) = await self._prepare()
        request = self.factory.get("/graphql")
        self.assertEqual(
            await transfer_value(
                request,
                await Content.objects.aget(flexid_cached=transfer_id),
                key=transfer_key,
                is_transfer=True,
            ),
            TransferResult.SUCCESS,
        )

        await sweepOutdated()
        self.assertTrue(
            (await Content.objects.aget(flexid_cached=content_id)).markForDestruction
        )
        finished = await Content.objects.aget(flexid_cached=transfer_id)
        self.assertFalse(finished.markForDestruction)
        self.assertFalse(
            await finished.tags.filter(tag__startswith="~transfer").aexists()
        )

    async def test_transfer_mutation(self):
        (
            manage_token,
            content_key,
            transfer_key,
            content_id,
            transfer_id,
        ) = await self._prepare()
        content = await Content.objects.aget(flexid_cached=transfer_id)
        encoded_bytes = (
            await content.tags.only("tag").aget(tag__startswith="~transfer_url=")
        ).tag.split("=", 1)[1]
        url = (await decryptString(transfer_key, encoded_bytes)).data.decode()
        headers = {}
        async for tag in content.tags.only("tag").filter(
            tag__startswith="~transfer_header="
        ):
            # headers must be ascii
            header = (
                (await decryptString(transfer_key, tag.tag.split("=", 1)[1]))
                .data.decode()
                .split("=", 1)
            )
            if len(header) == 2:
                headers[header[0]] = header[1]
        prepared_transfer2 = {
            "headers": headers,
            "url": url,
            "id": transfer_id,
            "authorization": [manage_token],
        }

        request = self.factory.get("/graphql")
        result = await schema.execute(
            transferMutation,
            prepared_transfer2,
            StrawberryDjangoContext(request=request, response=None),
        )
        self.assertFalse(result.errors)
        self.assertTrue(result.data)
        await sweepOutdated()
        self.assertTrue(
            (await Content.objects.aget(flexid_cached=content_id)).markForDestruction
        )
        finished = await Content.objects.aget(flexid_cached=transfer_id)
        self.assertFalse(finished.markForDestruction)
        self.assertFalse(
            await finished.tags.filter(tag__startswith="~transfer").aexists()
        )
