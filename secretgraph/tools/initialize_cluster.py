#! /usr/bin/env python3

import argparse
import asyncio
import base64
import json
import os
from io import BytesIO
from time import time
from urllib.parse import urlencode, urljoin

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, utils
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from gql import gql
from gql.client import AsyncClientSession

from secretgraph.core.utils.graphql import create_client
from secretgraph.core.utils.hashing import (
    findWorkingHashAlgorithms,
    hashObject,
    hashTagsContentHash,
)

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("--public-only", action="store_true")
parser.add_argument("--bits", "-b", type=int, default=4096)
parser.add_argument("--slots", nargs="+", default=["main"], type=str)
parser.add_argument("--store-config", type=argparse.FileType("w"))

serverConfigQuery_query = """
query serverSecretgraphConfigQuery {
    secretgraph{
        config {
            id
            hashAlgorithms
            registerUrl
        }
    }
}
"""

clusterCreateMutation_mutation = """
mutation clusterCreateMutation($description: String, $actions: [ActionInput!], $publicKey: Upload!, $privateKey: Upload, $publicTags: [String!]!, $privateTags: [String!]!, $nonce: String, $authorization: [String!]) {

    secretgraph{
        updateOrCreateCluster(
            input: {
                cluster: {
                    description: $description
                    actions: $actions
                    keys: [{
                        publicKey: $publicKey
                        publicTags: $publicTags
                        privateKey: $privateKey
                        privateTags: $privateTags
                        nonce: $nonce
                    }]
                }
                authorization: $authorization
            }
        ) {
            cluster {
                id
                groups
                availableActions {
                    keyHash
                    type
                    allowedTags
                }
                contents(
                    filters: {
                        states: ["trusted", "required", "public"]
                        deleted: FALSE
                        includeTypes: ["PublicKey"]
                    }
                ) {
                    edges {
                        node {
                            link
                        }
                    }
                }
            }
            writeok
        }
    }
}
"""  # noqa E502

configCreateMutation_mutation = """
mutation contentConfigMutation($cluster: ID!, $tags: [String!], $type: String!, $state: String!, $references: [ReferenceInput!], $value: Upload!, $nonce: String, $contentHash: String, $authorization: [String!]) {
    secretgraph{
        updateOrCreateContent(
        input: {
            content: {
                cluster: $cluster
                value: {
                    type: $type
                    state: $state
                    tags: $tags
                    value: $value
                    nonce: $nonce
                    references: $references
                }
                contentHash: $contentHash
            }
            authorization: $authorization
        }
        ) {
            content {
                id
                nonce
                link
            }
            writeok
        }
    }
}
"""  # noqa E502


async def run(argv, session: AsyncClientSession):
    nonce_key = os.urandom(13)
    nonce_key_b64 = base64.b64encode(nonce_key).decode("ascii")
    nonce_config = os.urandom(13)
    nonce_config_b64 = base64.b64encode(nonce_config).decode("ascii")

    privkey_key = os.urandom(32)
    privkey_key_b64 = base64.b64encode(privkey_key).decode("ascii")

    manage_token = os.urandom(50)
    manage_token_b64 = base64.b64encode(manage_token).decode("ascii")
    view_token = os.urandom(50)
    view_token_b64 = base64.b64encode(view_token).decode("ascii")
    config_key = os.urandom(32)
    config_key_b64 = base64.b64encode(config_key).decode("ascii")
    priv_key = rsa.generate_private_key(
        public_exponent=65537, key_size=argv.bits
    )
    pub_key = priv_key.public_key()
    pub_key_bytes = pub_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    priv_key_bytes = priv_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    result = await session.execute(gql(serverConfigQuery_query))
    serverConfig = result["secretgraph"]["config"]
    hash_algos = findWorkingHashAlgorithms(serverConfig["hashAlgorithms"])
    publicKey_hash = hashObject(pub_key_bytes, hash_algos[0])
    prepared_cluster = {
        "publicKey": BytesIO(pub_key_bytes),
        "publicTags": [],
        "state": "public",
        "actions": [
            {"value": '{"action": "manage"}', "key": manage_token_b64},
            {
                "value": json.dumps(
                    {
                        "action": "view",
                        "includeTypes": ["PublicKey", "PrivateKey", "Config"],
                        "includeTags": [
                            f"key_hash={publicKey_hash}",
                            f"slot={argv.slots[0]}",
                        ],
                    }
                ),
                "key": view_token_b64,
            },
        ],
    }
    if not argv.public_only:
        prepared_cluster["privateKey"] = BytesIO(
            AESGCM(privkey_key).encrypt(nonce_key, priv_key_bytes, None)
        )
        privatekey_key_enc = pub_key.encrypt(
            privkey_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hash_algos[0].algorithm),
                algorithm=hash_algos[0].algorithm,
                label=None,
            ),
        )
        prepared_cluster["nonce"] = nonce_key_b64
        prepared_cluster["privateTags"] = [
            "key={}".format(base64.b64encode(privatekey_key_enc)),
        ]
    result = await session.execute(
        gql(clusterCreateMutation_mutation),
        prepared_cluster,
        upload_files=True,
    )
    jsob_cluster = result["secretgraph"]["updateOrCreateCluster"]["cluster"]
    manage_key_hash = hashObject(manage_token, hash_algos[0])
    view_key_hash = hashObject(view_token, hash_algos[0])
    # config format by standard client
    config = {
        "certificates": {
            publicKey_hash: {
                "data": base64.b64encode(priv_key_bytes).decode("ascii"),
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
        "signWith": {argv.slots[0]: publicKey_hash},
        "hosts": {
            argv.url: {
                "clusters": {
                    jsob_cluster["id"]: {
                        "hashes": {
                            manage_key_hash: ["manage"],
                            view_key_hash: ["view"],
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

    nonce_key = os.urandom(13)
    nonce_key_b64 = base64.b64encode(nonce_key).decode("ascii")

    encrypted_content = AESGCM(config_key).encrypt(
        nonce_config, json.dumps(config).encode("utf8"), None
    )

    hash_ctx = hashes.Hash(hash_algos[0].algorithm)
    hash_ctx.update(encrypted_content)
    encrypted_content_hash_raw = hash_ctx.finalize()
    signature = priv_key.sign(
        encrypted_content_hash_raw,
        padding.PSS(
            mgf=padding.MGF1(hash_algos[0].algorithm),
            salt_length=padding.PSS.MAX_LENGTH,
        ),
        utils.Prehashed(hash_algos[0].algorithm),
    )

    config_key_enc = pub_key.encrypt(
        config_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hash_algos[0].algorithm),
            algorithm=hash_algos[0].algorithm,
            label=None,
        ),
    )
    config_contentHash = hashTagsContentHash(
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
                "extra": "{}:{}".format(
                    hash_algos[0].serializedName,
                    base64.b64encode(config_key_enc).decode("ascii"),
                ),
            },
            {
                "group": "signature",
                "target": publicKey_hash,
                "extra": "{}:{}".format(
                    hash_algos[0].serializedName,
                    base64.b64encode(signature).decode("ascii"),
                ),
            },
        ],
        "value": BytesIO(encrypted_content),
        "nonce": nonce_config_b64,
        "contentHash": config_contentHash,
        "authorization": [
            ":".join([config["configCluster"], manage_token_b64])
        ],
    }

    result = await session.execute(
        gql(configCreateMutation_mutation), prepared_content, upload_files=True
    )

    jsob_config = result["secretgraph"]["updateOrCreateContent"]
    link = jsob_config["content"]["link"]
    print()

    search = urlencode(
        {
            "token": "{}:{}".format(
                jsob_cluster["id"],
                view_token_b64,
            ),
            "key": [
                "{}:{}".format(
                    publicKey_hash,
                    privkey_key_b64,
                ),
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
