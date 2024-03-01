#! /usr/bin/env python3

import argparse
import asyncio
import base64
import json
import os
from io import BytesIO
from time import time
from urllib.parse import urlencode, urljoin

from gql import gql
from gql.client import AsyncClientSession

from secretgraph.core.utils.crypto import (
    encrypt,
    encryptString,
    findWorkingAlgorithms,
    generateEncryptionKey,
    hashKey,
    serializeEncryptionParams,
    sign,
    toPublicKey,
)
from secretgraph.core.utils.graphql import create_client
from secretgraph.core.utils.hashing import (
    hashObject,
    hashTagsContentHash,
)
from secretgraph.queries.cluster import createClusterMutation
from secretgraph.queries.content import createContentMutation
from secretgraph.queries.server import serverConfigQuery

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("--public-only", action="store_true")
parser.add_argument("--bits", "-b", type=int, default=4096)
parser.add_argument("--slots", nargs="+", default=["main"], type=str)
parser.add_argument("--store-config", type=argparse.FileType("w"))


async def run(argv, session: AsyncClientSession):
    private_key_key = os.urandom(32)

    manage_token = os.urandom(50)
    manage_token_b64 = base64.b64encode(manage_token).decode("ascii")
    view_token = os.urandom(50)
    view_token_b64 = base64.b64encode(view_token).decode("ascii")
    config_key = os.urandom(32)
    config_key_b64 = base64.b64encode(config_key).decode("ascii")
    private_key = await generateEncryptionKey("rsa-sha512", {"bits": argv.bits})
    encrypted_private_key = await encrypt(
        private_key_key, private_key.key, algorithm="AESGCM"
    )
    public_key = toPublicKey(private_key, algorithm=private_key.serializedName)
    result = await session.execute(gql(serverConfigQuery))
    serverConfig = result["secretgraph"]["config"]
    hash_algos = findWorkingAlgorithms(serverConfig["hashAlgorithms"], "hash")
    manage_key_hash = await hashObject((b"secretgraph", manage_token), hash_algos[0])
    view_key_hash = await hashObject((b"secretgraph", view_token), hash_algos[0])
    publicKey_hash = await hashKey(
        public_key, keyAlgorithm=public_key.key, deriveAlgorithm=hash_algos[0]
    )

    key1 = {
        "publicKey": BytesIO(public_key),
        "publicState": "trusted",
        "publicTags": ["name=initial key"],
    }
    if not argv.public_only:
        key1["privateKey"] = BytesIO(encrypted_private_key.data)
        key1["cryptoParameters"] = await serializeEncryptionParams(
            encrypted_private_key.params, algorithm=encrypted_private_key.serializedName
        )
        key1["privateTags"] = [
            "name=initial key",
            "key={}".format(
                await encryptString(public_key, private_key_key, algorithm="rsa-sha512")
            ),
        ]

    prepared_cluster = {
        "publicTags": [],
        "state": "public",
        "keys": [key1],
        "actions": [
            {"value": '{"action": "manage"}', "key": manage_token_b64},
            {
                "value": json.dumps(
                    {
                        "action": "view",
                        "includeTypes": ["PublicKey", "PrivateKey", "Config"],
                        "includeTags": [
                            f"key_hash={await hashKey}",
                            f"slot={argv.slots[0]}",
                        ],
                    }
                ),
                "key": view_token_b64,
            },
        ],
    }
    result = await session.execute(
        gql(createClusterMutation),
        prepared_cluster,
        upload_files=True,
    )
    jsob_cluster = result["secretgraph"]["updateOrCreateCluster"]["cluster"]
    # config format by standard client
    config = {
        "certificates": {
            publicKey_hash: {
                "data": base64.b64encode(private_key).decode("ascii"),
                "type": "rsa-sha512",
                "note": "initial key",
            }
        },
        "tokens": {
            manage_key_hash: {
                "data": manage_token_b64,
                "system": False,
                "note": "",
            },
            view_key_hash: {
                "data": view_token_b64,
                "system": True,
                "note": "config token",
            },
        },
        "slots": argv.slots,
        "signWith": {argv.slots[0]: [publicKey_hash]},
        "hosts": {
            argv.url: {
                "clusters": {
                    jsob_cluster["id"]: {
                        "hashes": {
                            manage_key_hash: ["manage"],
                            view_key_hash: ["view"],
                            publicKey_hash: [],
                        }
                    }
                },
            }
        },
        "trustedKeys": {
            publicKey_hash: {
                "links": [
                    urljoin(
                        argv.url,
                        # public key
                        jsob_cluster["contents"]["edges"][0]["node"]["link"],
                    )
                ],
                "level": 1,
                "note": "",
                "lastChecked": int(time()),
            }
        },
        "baseUrl": argv.url,
        "configHashes": [publicKey_hash, manage_key_hash],
        "configCluster": jsob_cluster["id"],
    }

    encrypted_content = await encrypt(
        config_key, json.dumps(config).encode("utf8"), algorithm="AESGCM"
    )
    signature = await sign(
        private_key.key, encrypted_content.data, algorithm=private_key.serializedName
    )

    config_contentHash = await hashTagsContentHash(
        [f"slot={argv.slots[0]}"], "Config", hash_algos[0]
    )

    tags = [
        "name=config.json",
        "mime=application/json",
        "key_hash={}".format(publicKey_hash),
        f"slot={argv.slots[0]}",
    ]
    prepared_content = {
        "cluster": config["configCluster"],
        "type": "Config",
        "state": "protected",
        "tags": tags,
        "references": [
            {
                "group": "key",
                "target": publicKey_hash,
                "extra": await encryptString(
                    public_key.key, config_key, algorithm="rsa-sha512"
                ),
            },
            {
                "group": "signature",
                "target": publicKey_hash,
                "extra": signature,
            },
        ],
        "value": BytesIO(encrypted_content.data),
        "cryptoParameters": serializeEncryptionParams(
            encrypted_content.params, encrypted_content.serializedName
        ),
        "contentHash": config_contentHash,
        "authorization": [":".join([config["configCluster"], manage_token_b64])],
    }

    result = await session.execute(
        gql(createContentMutation), prepared_content, upload_files=True
    )

    jsob_config = result["secretgraph"]["updateOrCreateContent"]
    link = jsob_config["content"]["link"]

    search = urlencode(
        {
            "token": "{}:{}".format(
                jsob_cluster["id"],
                view_token_b64,
            ),
            "key": [
                "{}:{}".format(publicKey_hash, base64.b64encode(private_key_key)),
                "{}:{}".format(
                    jsob_config["content"]["id"],
                    config_key_b64,
                ),
            ],
        },
        doseq=True,
    )
    print("Cluster:", jsob_cluster["id"])
    print("Initialization url: {}?{}".format(urljoin(argv.url, link), search))
    if argv.store_config:
        argv.store_config.write(config)


async def setup_and_run(argv):
    client = create_client(argv.url)
    try:
        session = await client.connect_async()
    except Exception as exc:
        if argv.url.endswith("/graphql"):
            raise exc
        argv.url = "%s/graphql" % argv.url.rstrip("/")

        client = create_client(argv.url)
        session = await client.connect_async()
    try:
        await run(argv, session)
    finally:
        await client.close_async()


def main(argv=None):
    argv = parser.parse_args(argv)
    asyncio.run(setup_and_run(argv))


if __name__ == "__main__":
    main()
