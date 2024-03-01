import asyncio
import json
import os
from base64 import b64decode, b64encode
from time import time
from urllib.parse import urlencode, urljoin

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.test.client import RequestFactory
from django.urls import reverse

from ....core import constants
from ....core.typings import ConfigInterface
from ....core.utils.crypto import (
    encrypt,
    encryptString,
    findWorkingAlgorithms,
    generateEncryptionKey,
    hashKey,
    serializeEncryptionParams,
    sign,
    toPublicKey,
)
from ...actions.update import (
    ActionInput,
    ContentInput,
    ContentKeyInput,
    ContentValueInput,
    ReferenceInput,
    create_cluster_fn,
    create_content_fn,
)
from ...models import Net
from ...schema.arguments import ClusterInput
from ...utils.auth import update_cached_net_properties
from ...utils.hashing import hashObject, hashTagsContentHash


def _gen_data_b64(inp: bytes | str):
    # returns bytes, b64bytes
    if isinstance(inp, str):
        return (
            b64decode(inp),
            inp,
        )
    return inp, b64encode(inp).decode("ascii")


async def _gen_data_b64_hash(inp: bytes | str):
    ret = _gen_data_b64(inp)
    return *ret, await hashObject(ret[0])


async def _gen_token_data_b64_hash(inp: bytes | str):
    # tokens are
    ret = _gen_data_b64(inp)
    if len(ret[0]) < 50:
        raise ValueError("Token too short")
    return *ret, await hashObject((b"secretgraph", ret[0]))


class Command(BaseCommand):
    help = "Initialize cluster"

    def add_arguments(self, parser):
        parser.add_argument("--token", nargs="?", default=None, help="View token")
        parser.add_argument("--quota", default=None, type=int)
        parser.add_argument("--bits", "-b", type=int, default=4096)
        parser.add_argument("--slots", nargs="+", default=["main"], type=str)
        parser.add_argument("--max-upload-size", default=None, type=int)
        parser.add_argument("--net", default=None)
        parser.add_argument("--user", default=None)
        parser.add_argument("--name", default="")
        parser.add_argument("--description", default="")
        parser.add_argument(
            "--public-key-state",
            default="trusted",
            choices=["trusted", "required"],
        )

    async def _handle(self, **options):
        if not options["token"]:
            options["token"] = b64encode(os.urandom(50)).decode("ascii")
        if options["net"]:
            if options["net"].isdigit():
                net = await Net.objects.aget(id=options["net"])
            else:
                net = await Net.objects.aget(
                    Q(cluster__flexid=options["net"])
                    | Q(cluster__flexid_cached=options["net"])
                )
        else:
            net = Net()
            if options["user"]:
                net.user_name = options["user"]
            if options["quota"]:
                net.quota = options["quota"]
            else:
                net.reset_quota()

            if options["max_upload_size"]:
                net.max_upload_size = options["max_upload_size"]
            else:
                net.reset_max_upload_size()
        hash_algo = findWorkingAlgorithms(settings.SECRETGRAPH_HASH_ALGORITHMS, "hash")[
            0
        ]
        view_token, view_token_b64, view_token_hash = await _gen_token_data_b64_hash(
            options["token"]
        )
        manage_key, manage_key_b64, manage_key_hash = await _gen_token_data_b64_hash(
            os.urandom(50)
        )
        config_shared_key, config_shared_key_b64 = _gen_data_b64(os.urandom(32))
        private_key_key, private_key_key_b64 = _gen_data_b64(os.urandom(32))
        private_key = await generateEncryptionKey(
            "rsa-sha512", {"bits": options["bits"]}
        )

        encrypted_private_key = await encrypt(private_key_key, algorithm="AESGCM")
        public_key = await toPublicKey(
            private_key.key, algorithm=private_key.serializedName
        )
        publicKey_hash = await hashKey(
            public_key.key,
            keyAlgorithm=public_key.serializedName,
            deriveAlgorithm=hash_algo,
        )
        url = reverse("graphql-plain")
        request = RequestFactory().get(url)
        update_cached_net_properties(
            request,
            properties=[
                "manage_cluster_groups",
                "manage_net_groups",
                "manage_update",
            ],
            emptyOk=True,
        )
        clusterfn = await create_cluster_fn(
            request,
            ClusterInput(
                net=net,
                name=options["name"],
                description=options["description"],
                actions=[
                    ActionInput(
                        value='{"action": "manage"}',
                        key=manage_key,
                    ),
                    ActionInput(
                        value=json.dumps(
                            {
                                "action": "view",
                                "includeTypes": [
                                    "PublicKey",  # for safety reasons
                                    "PrivateKey",
                                    "Config",
                                ],
                                "includeTags": [f"key_hash={publicKey_hash}"],
                            }
                        ),
                        key=view_token,
                    ),
                ],
                keys=[
                    ContentKeyInput(
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
                    )
                ],
            ),
        )
        if not net.id:
            await net.asave()
        cluster = (await clusterfn(transaction.atomic))["cluster"]
        pkey = await cluster.contents.aget(type="PublicKey")
        config: ConfigInterface = {
            "baseUrl": url,
            "configCluster": cluster.flexid_cached,
            "certificates": {
                publicKey_hash: {
                    "data": b64encode(private_key).decode(),
                    "type": "rsa-sha512",
                    "note": "initial certificate",
                }
            },
            "tokens": {
                view_token_hash: {
                    "data": view_token_b64,
                    "system": True,
                    "note": "config token",
                },
                manage_key_hash: {
                    "data": manage_key_b64,
                    "system": False,
                    "note": "initial token",
                },
            },
            "slots": options["slots"],
            "signWith": {options["slots"][0]: [publicKey_hash]},
            "hosts": {
                url: {
                    "clusters": {
                        cluster.flexid_cached: {
                            "hashes": {
                                view_token_hash: ["view"],
                                manage_key_hash: ["manage"],
                                publicKey_hash: [],
                            }
                        }
                    },
                    "contents": {},
                }
            },
            "trustedKeys": {
                publicKey_hash: {
                    "links": [urljoin(url, pkey.link)],
                    "level": 1,
                    "note": "",
                    "lastChecked": int(time()),
                }
            },
        }
        configEncrypted = await encrypt(
            config_shared_key, json.dumps(config).encode("utf8"), algorithm="AESGCM"
        )
        content = await create_content_fn(
            request,
            ContentInput(
                net=net,
                cluster=cluster,
                value=ContentValueInput(
                    value=configEncrypted.data,
                    state="protected",
                    type="Config",
                    cryptoParameters=serializeEncryptionParams(
                        configEncrypted.params, algorithm="AESGCM"
                    ),
                    tags=[
                        "name=config.json",
                        "mime=application/json",
                        f"key_hash={publicKey_hash}",
                        "slot={}".format(options["slots"][0]),
                    ],
                    references=[
                        ReferenceInput(
                            target=publicKey_hash,
                            group="key",
                            extra=await encryptString(
                                public_key, config_shared_key, algorithm="rsa-sha512"
                            ),
                            deleteRecursive=(constants.DeleteRecursive.NO_GROUP),
                        ),
                        ReferenceInput(
                            target=publicKey_hash,
                            group="signature",
                            extra=await sign(
                                private_key,
                                configEncrypted.data,
                                algorithm="rsa-sha512",
                            ),
                            deleteRecursive=(constants.DeleteRecursive.NO_GROUP),
                        ),
                    ],
                ),
                contentHash=hashTagsContentHash(
                    map(lambda x: f"slot={x}", options["slots"]),
                    "Config",
                ),
            ),
            authset=[f"{cluster.flexid_cached}:{manage_key}"],
        )()["content"]
        search = urlencode(
            {
                "token": "{}:{}".format(
                    cluster.flexid_cached,
                    view_token_b64,
                ),
                "key": [
                    "{}:{}".format(
                        publicKey_hash,
                        private_key_key_b64,
                    ),
                ],
            },
            doseq=True,
        )
        print("Cluster:", cluster.flexid_cached)
        print("Initialization url: {}?{}".format(urljoin(url, content.link), search))

    def handle(self, **options):
        asyncio.run(self._handle(options))
