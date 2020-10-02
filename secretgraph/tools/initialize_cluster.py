#! /usr/bin/env python3

import os
import base64
import hashlib
import argparse

from cryptography.hazmat.primitives.asymmetric import rsa, dsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import requests

from ..utils.graphql import transform_payload, reset_files, sortedHash

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("--public", action="store_true")
parser.add_argument("--bits", "-b", type=int, default=4096)
parser.add_argument("--algo", "-t", choices=[
    "rsa", "dsa"
], default="rsa")


clusterCreateMutation_mutation = """
mutation clusterCreateMutation($publicInfo: Upload, $actions: [ActionInput!], $publicKey: Upload!, $privateKey: Upload, $privateTags: [String!]!, $nonce: String, $authorization: [String!]) {
    updateOrCreateCluster(
      input: {
        cluster: {
          publicInfo: $publicInfo
          actions: $actions
          key: {
            publicKey: $publicKey
            publicTags: ["state=public"]
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
          requiredKeys
          allowedTags
        }
      }
      writeok
    }
    secretgraphConfig {
      hashAlgorithms
    }
  }
"""  # noqa E502


def main(argv=None):
    argv = parser.parse_args(argv)
    nonce = os.urandom(13)
    nonce_b64 = base64.b64encode(nonce).decode("ascii")

    privkey_key = os.urandom(32)

    action_key = os.urandom(32)
    action_key_b64 = base64.b64encode(action_key).decode("ascii")
    if argv.algo == "rsa":
        priv_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=argv.bits
        )
    elif argv.algo == "dsa":
        priv_key = dsa.generate_private_key(
            public_exponent=65537,
            key_size=argv.bits
        )
    pub_key = priv_key.public_key()
    prepared = {
        "publicKey": pub_key.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ),
        "actions": [
            {
                "value": '{"action": "manage"}',
                "key": action_key_b64
            }
        ]
    }
    priv_key_bytes = priv_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    if True:
        prepared["privateKey"] = AESGCM(privkey_key).encrypt(
            nonce, priv_key_bytes, None
        )
        prepared["nonce"] = nonce_b64
        prepared["privateTags"] = ["state=internal"]
    body, files = transform_payload(
        clusterCreateMutation_mutation,
        prepared
    )

    session = requests.Session()
    result = session.post(
        argv.url, data=body, files=files
    )
    if not result.ok and not argv.url.endswith("/graphql"):
        reset_files(files)
        argv.url = "%s/graphql" % argv.url.strip("/")
        result = session.post(
            argv.url, data=body, files=files
        )
    result.raise_for_status()
    jsob = result.json()["data"]
    print(jsob)
    hash_algo = hashlib.new(jsob["secretgraphConfig"]["hashAlgorithms"][0])
    certhash = hash_algo.clone()
    certhash.update(priv_key_bytes)
    certhash = certhash.digest()
    certhash_b64 = base64.b64encode(certhash).decode("ascii")
    actionkey_hash = hash_algo.clone()
    actionkey_hash.update(action_key)
    action_key = action_key.digest()
    actionkey_hash = base64.b64encode(action_key).decode("ascii")
    config = {
        "certificates": {
            certhash_b64: base64.b64encode(priv_key_bytes).decode("ascii")
        },
        "tokens": {},
        "hosts": {
            argv.url: {
                "hashAlgorithms": jsob["secretgraphConfig"]["hashAlgorithms"],
                "clusters": {
                    jsob["updateOrCreateCluster"]["cluster"]["id"]: {

                    }
                }
            }
        },
        "baseUrl": argv.url,
        "configHashes": [certhash_b64, actionkey_hash],
        "configCluster": jsob["updateOrCreateCluster"]["cluster"]["id"]
    }


if __name__ == "__main__":
    main()
