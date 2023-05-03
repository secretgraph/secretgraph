#! /usr/bin/env python3

import os
import base64
import hashlib
import json
import argparse
from time import time
from urllib.parse import urljoin

from cryptography.hazmat.primitives.asymmetric import rsa, padding, utils
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import httpx

from secretgraph.core.utils.hashing import findWorkingHashAlgorithms

from ..core.utils.graphql import transform_payload

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("--public", action="store_true")
parser.add_argument("--bits", "-b", type=int, default=4096)

serverConfigQuery_query = """
query serverSecretgraphConfigQuery {
    secretgraph{
        config {
            id
            hashAlgorithms
            groups {
                name
                injected_keys {
                    id
                    link
                    hash
                }
            }
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
                    key: {
                        publicKey: $publicKey
                        publicTags: $publicTags
                        privateKey: $privateKey
                        privateTags: $privateTags
                        nonce: $nonce
                    }
                }
                authorization: $authorization
            }
        ) {
            cluster {
                id
                group
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
mutation contentConfigMutation($cluster: ID!, $tags: [String!], $references: [ReferenceInput!], $value: Upload!, $nonce: String, $contentHash: String, $authorization: [String!]) {
    secretgraph{
        updateOrCreateContent(
        input: {
            content: {
            cluster: $cluster
            value: {
                tags: $tags
                value: $value
                nonce: $nonce
            }
            contentHash: $contentHash
            references: $references
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


def main(argv=None):
    argv = parser.parse_args(argv)
    nonce = os.urandom(13)
    nonce_b64 = base64.b64encode(nonce).decode("ascii")

    privkey_key = os.urandom(32)

    action_key = os.urandom(50)
    action_key_b64 = base64.b64encode(action_key).decode("ascii")
    config_shared_key = os.urandom(32)
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

    session = httpx.Client()
    body, files = transform_payload(serverConfigQuery_query, {})
    result = session.post(argv.url, data=body, files=files)
    if not result.ok and not argv.url.endswith("/graphql"):
        argv.url = "%s/graphql" % argv.url.rstrip("/")
        result = session.post(argv.url, data=body, files=files)
    if not result.ok:
        raise
    serverConfig = result.json()["data"]["secretgraphConfig"]
    hash_algos = findWorkingHashAlgorithms(serverConfig["hashAlgorithms"])
    hash_algo = hashlib.new(hash_algos[0].serializedName)
    chosen_hash = hashes.Hash(hash_algos[0].algorithm)
    prepared_cluster = {
        "publicKey": pub_key_bytes,
        "publicTags": [],
        "state": "public",
        "actions": [{"value": '{"action": "manage"}', "key": action_key_b64}],
    }
    if True:
        prepared_cluster["privateKey"] = AESGCM(privkey_key).encrypt(
            nonce, priv_key_bytes, None
        )
        encSharedKey = pub_key.encrypt(
            config_shared_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=chosen_hash),
                algorithm=chosen_hash,
                label=None,
            ),
        )
        prepared_cluster["nonce"] = nonce_b64
        prepared_cluster["privateTags"] = [
            "key={}".format(base64.b64encode(encSharedKey)),
        ]
    body, files = transform_payload(
        clusterCreateMutation_mutation, prepared_cluster
    )
    result = session.post(argv.url, data=body, files=files)
    result.raise_for_status()
    jsob = result.json()["data"]
    certhash = hash_algo.copy()
    certhash.update(pub_key_bytes)
    certhash = certhash.digest()
    certhash_b64 = base64.b64encode(certhash).decode("ascii")
    action_key_hash = hash_algo.copy()
    action_key_hash.update(action_key)
    action_key_hash = action_key_hash.digest()
    action_key_hash = base64.b64encode(action_key_hash).decode("ascii")
    # config format by standard client
    config = {
        "certificates": {
            certhash_b64: {
                "data": base64.b64encode(priv_key_bytes).decode("ascii"),
                "note": "initial key",
                "signWith": True,
            }
        },
        "tokens": {
            action_key_hash: {
                "data": action_key_b64,
                "system": False,
                "note": "",
            }
        },
        "hosts": {
            argv.url: {
                "hashAlgorithms": hash_algos,
                "clusters": {
                    jsob["secretgraph"]["updateOrCreateCluster"]["cluster"][
                        "id"
                    ]: {
                        "hashes": {
                            action_key_hash: ["manage", "view", "update"]
                        }
                    }
                },
            }
        },
        "trustedKeys": {
            certhash_b64: {
                "links": [
                    urljoin(
                        argv.url,
                        # public key
                        jsob["secretgraph"]["updateOrCreateCluster"][
                            "cluster"
                        ]["contents"]["edges"][0]["node"].link,
                    )
                ],
                "level": 1,
                "note": "",
                "lastChecked": int(time()),
            }
        },
        "baseUrl": argv.url,
        "configHashes": [certhash_b64, action_key_hash],
        "configCluster": jsob["secretgraph"]["updateOrCreateCluster"][
            "cluster"
        ]["id"],
    }

    nonce = os.urandom(13)
    nonce_b64 = base64.b64encode(nonce).decode("ascii")

    encrypted_content = AESGCM(config_shared_key).encrypt(
        nonce, json.dumps(config).encode("utf8"), None
    )

    encrypted_content_hash_raw = hash_algo.copy()
    encrypted_content_hash_raw.update(encrypted_content)
    encrypted_content_hash_raw = encrypted_content_hash_raw.digest()
    signature = priv_key.sign(
        encrypted_content_hash_raw,
        padding.PSS(
            mgf=padding.MGF1(chosen_hash), salt_length=padding.PSS.MAX_LENGTH
        ),
        utils.Prehashed(chosen_hash),
    )

    config_key = pub_key.encrypt(
        config_shared_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=chosen_hash),
            algorithm=chosen_hash,
            label=None,
        ),
    )

    config_hash = hash_algo.copy()
    config_hash.update(b"type=Config")
    config_hash = config_hash.digest()
    config_hash = base64.b64encode(config_hash).decode("ascii")
    tags = [
        "key_hash={}".format(action_key_hash),
        "key_hash={}".format(certhash_b64),
    ]
    prepared_content = {
        "cluster": config["configCluster"],
        "type": "Config",
        "state": "protected",
        "tags": tags,
        "references": [
            {
                "group": "key",
                "target": certhash_b64,
                "extra": base64.b64encode(config_key).decode("ascii"),
            },
            {
                "group": "signature",
                "target": certhash_b64,
                "extra": base64.b64encode(signature).decode("ascii"),
            },
        ],
        "value": encrypted_content,
        "nonce": nonce_b64,
        "contentHash": config_hash,
        "authorization": [":".join([config["configCluster"], action_key_b64])],
    }
    body, files = transform_payload(
        configCreateMutation_mutation, prepared_content
    )

    result = session.post(argv.url, data=body, files=files)
    result.raise_for_status()
    print(config)


if __name__ == "__main__":
    main()
