import base64
import json
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.files.base import ContentFile
from django.test import RequestFactory, TransactionTestCase
from strawberry.django.context import StrawberryDjangoContext

from secretgraph.core.constants import TransferResult
from secretgraph.core.utils.crypto import (
    findWorkingAlgorithms,
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
        manage_token_raw = os.urandom(50)
        view_token_raw = os.urandom(50)
        request = self.factory.get("/graphql")
        signkey = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pub_signkey = signkey.public_key()
        pub_signkey_bytes = pub_signkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        # 1024 is too small and could not be used for OAEP
        encryptkey = rsa.generate_private_key(public_exponent=65537, key_size=2048)
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
                        "key": base64.b64encode(manage_token_raw).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )

        clusterid = result.data["secretgraph"]["updateOrCreateCluster"]["cluster"]["id"]

        hash_algos = findWorkingAlgorithms(settings.SECRETGRAPH_HASH_ALGORITHMS, "hash")
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
        m_token = f"{clusterid}:{base64.b64encode(manage_token_raw).decode()}"
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
                    "extra": "{}:{}".format(
                        hash_algos[0].serializedName,
                        base64.b64encode(content_shared_key_enc).decode("ascii"),
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
        url_nonce = os.urandom(13)
        transfer_shared_key = os.urandom(32)
        transfer_nonce = os.urandom(13)
        encrypted_url_tag = base64.b64encode(
            url_nonce
            + AESGCM(transfer_shared_key).encrypt(url_nonce, url.encode("utf8"), None)
        ).decode()
        header_nonce = os.urandom(13)
        header = f"Authorization={clusterid}:{base64.b64encode(view_token_raw).decode('ascii')}"
        encrypted_header_tag = base64.b64encode(
            header_nonce
            + AESGCM(transfer_shared_key).encrypt(header_nonce, header.encode(), None)
        ).decode()
        transfer_shared_key_enc = pub_encryptkey.encrypt(
            transfer_shared_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hash_algos[0].algorithm),
                algorithm=hash_algos[0].algorithm,
                label=None,
            ),
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
                {
                    "group": "signature",
                    "target": pub_signKey_hash,
                    "extra": "{}:{}".format(
                        hash_algos[0].serializedName,
                        base64.b64encode(signature).decode("ascii"),
                    ),
                },
                {
                    "group": "transfer",
                    "target": pub_encryptKey_hash,
                    "extra": "{}:{}".format(
                        hash_algos[0].serializedName,
                        base64.b64encode(transfer_shared_key_enc).decode("ascii"),
                    ),
                },
            ],
            "value": ContentFile(b""),
            "nonce": base64.b64encode(transfer_nonce).decode(),
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
        decryptor = AESGCM(transfer_key)
        raw_bytes = base64.b64decode(
            (
                await content.tags.only("tag").aget(tag__startswith="~transfer_url=")
            ).tag.split("=", 1)[1]
        )
        url = decryptor.decrypt(
            raw_bytes[:13],
            raw_bytes[13:],
            None,
        ).decode()
        headers = {}
        async for tag in content.tags.only("tag").filter(
            tag__startswith="~transfer_header="
        ):
            raw_bytes = base64.b64decode(tag.tag.split("=", 1)[1])
            # headers must be ascii
            header = (
                decryptor.decrypt(raw_bytes[:13], raw_bytes[13:], None)
                .decode("ascii")
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
