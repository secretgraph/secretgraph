import argparse
import asyncio
import os
from base64 import b64decode, b64encode

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.test.client import RequestFactory
from django.urls import reverse

from ....core.utils.crypto import (
    encrypt,
    encryptString,
    generateEncryptionKey,
    serializeEncryptionParams,
    toPublicKey,
)
from ...actions.update import ContentInput, ContentKeyInput, create_key_fn
from ...models import Cluster, Net


def _gen_data_b64(inp: bytes | str):
    # returns bytes, b64bytes
    if isinstance(inp, str):
        return (
            b64decode(inp),
            inp,
        )
    return inp, b64encode(inp).decode("ascii")


class Command(BaseCommand):
    help = "Create cluster"

    def add_arguments(self, parser):
        parser.add_argument("--key", default=None, help="PrivateKey encryption key")
        parser.add_argument("--bits", "-b", type=int, default=4096)
        parser.add_argument("--net", default=None)
        parser.add_argument(
            "--public-key-state",
            default="trusted",
            choices=["public", "trusted", "required"],
        )
        parser.add_argument("cluster")
        parser.add_argument(
            "out",
            nargs="?",
            default=None,
            type=argparse.FileType("wb"),
            help="Ceritificate out (Public+Private Part)",
        )

    async def _handle(self, **options):
        if not options["key"]:
            options["key"] = b64encode(os.urandom(32)).decode("ascii")
        cluster = Cluster.objects.get(
            Q(flexid=options["cluster"]) | Q(flexid_cached=options["cluster"])
        )
        if options["net"]:
            if options["net"].isdigit():
                net = Net.objects.get(id=options["net"])
            else:
                net = Net.objects.get(
                    Q(cluster__flexid=options["net"])
                    | Q(cluster__flexid_cached=options["net"])
                )
        else:
            net = cluster.net
        private_key_key, private_key_key_b64 = _gen_data_b64(os.urandom(32))
        private_key = await generateEncryptionKey(
            "rsa-sha512", {"bits": options["bits"]}
        )
        encrypted_private_key = await encrypt(private_key_key, algorithm="AESGCM")
        public_key = await toPublicKey(
            private_key.key, algorithm=private_key.serializedName
        )
        url = reverse("graphql-plain")
        request = RequestFactory().get(url)
        keyfn = await create_key_fn(
            request,
            ContentInput(
                net=net,
                cluster=cluster,
                key=ContentKeyInput(
                    publicKey=public_key,
                    publicState=options["public_key_state"],
                    privateKey=encrypted_private_key.data,
                    cryptoParameters=await serializeEncryptionParams(
                        encrypted_private_key.params,
                        encrypted_private_key.serializedName,
                    ),
                    privateTags=(
                        "name=initial private key generated by command",
                        "key={}".format(
                            await encryptString(
                                public_key, private_key_key, algorithm="rsa-sha512"
                            )
                        ),
                    ),
                    publicTags=["name=initial key generated by command"],
                ),
            ),
        )

        result = await keyfn(transaction.atomic())
        print("PublicKey id:", result["public"].flexid_cached)
        print("PrivateKey id:", result["private"].flexid_cached)
        print("PrivateKey encryption key:", options["key"])

        if options["out"]:
            options["out"].write(b"-----BEGIN PUBLIC KEY-----\n")
            options["out"].write(b64encode(public_key))
            options["out"].write(b"-----END PUBLIC KEY-----\n")
            options["out"].write(b"\n")
            options["out"].write(b"-----BEGIN PRIVATE KEY-----\n")
            options["out"].write(b64encode(private_key.key))
            options["out"].write(b"-----END PRIVATE KEY-----\n")
            print("Certificate written")

    def handle(self, **options):
        asyncio.run(self._handle(options))
