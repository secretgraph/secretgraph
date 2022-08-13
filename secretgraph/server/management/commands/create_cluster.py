import hashlib
import json
import os
from base64 import b64decode, b64encode
from urllib.parse import urlencode, urljoin

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.test.client import RequestFactory
from django.urls import reverse

from ...actions.update import create_cluster_fn, create_content_fn
from ...models import Net
from ...utils.misc import hash_object
from .... import constants


def _gen_key_vars_nohash(inp: bytes | str):
    if isinstance(inp, str):
        return (
            b64decode(inp),
            inp,
        )
    return inp, b64encode(inp).decode("ascii")


def _gen_key_vars(inp: bytes | str):
    ret = _gen_key_vars_nohash(inp)
    return *ret, hash_object(ret[0])


class Command(BaseCommand):
    help = "Create cluster"

    def add_arguments(self, parser):
        parser.add_argument("--key", nargs="?", default=None)
        parser.add_argument("--quota", nargs="?", default=None, type=int)
        parser.add_argument("--bits", "-b", type=int, default=4096)
        parser.add_argument(
            "--max_upload_size", nargs="?", default=None, type=int
        )
        parser.add_argument("--net", nargs="?", default=None)
        parser.add_argument("--user", nargs="?", default=None)
        parser.add_argument("domain", nargs="?", default="localhost:8000")

    def handle(self, **options):
        if not options["key"]:
            options["key"] = b64encode(os.urandom(32)).decode("ascii")
        if options["net"]:
            if options["net"].isdigit():
                net = Net.objects.get(id=options["net"])
            else:
                net = Net.objects.get(
                    Q(cluster__flexid=options["net"])
                    | Q(cluster__flexid_cached=options["net"])
                )
        else:
            net = Net()
            if options["user"]:
                User = get_user_model()
                net.user = User.objects.get(
                    **{User.USERNAME_FIELD: options["user"]}
                )
            if options["quota"]:
                net.quota = options["quota"]
            else:
                net.reset_quota()

            if options["max_upload_size"]:
                net.max_upload_size = options["max_upload_size"]
            else:
                net.reset_max_upload_size()
        hash_algo = hashlib.new(settings.SECRETGRAPH_HASH_ALGORITHMS[0])
        hash_algo_name = hash_algo.name
        hash_algo = getattr(hashes, hash_algo_name.upper())()
        nonce_config = os.urandom(13)
        nonce_privkey = os.urandom(13)
        view_key, view_key_b64, view_key_hash = _gen_key_vars(options["key"])
        manage_key, manage_key_b64, manage_key_hash = _gen_key_vars(
            os.urandom(32)
        )
        privkey_key, privkey_key_b64 = _gen_key_vars_nohash(os.urandom(32))
        config_shared_key, config_shared_key_b64 = _gen_key_vars_nohash(
            os.urandom(32)
        )
        privateKey = rsa.generate_private_key(
            public_exponent=65537, key_size=options["bits"]
        )
        privateKey_bytes, privateKey_b64 = _gen_key_vars_nohash(
            privateKey.private_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        publicKey = privateKey.public_key()
        publicKey_bytes, publicKey_b64, publicKey_hash = _gen_key_vars(
            publicKey.public_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
        )

        url = urljoin(options["domain"], reverse("graphql-plain"))
        request = RequestFactory().get(url)
        clusterfn = create_cluster_fn(
            request,
            {
                "net": net,
                "actions": [
                    {
                        "value": '{"action": "manage"}',
                        "key": manage_key,
                    },
                    {
                        "value": json.dumps(
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
                        "key": view_key,
                    },
                ],
                "key": {
                    "publicKey": publicKey_bytes,
                    "privateKey": AESGCM(privkey_key).encrypt(
                        nonce_privkey, privateKey_bytes, None
                    ),
                    "nonce": nonce_privkey,
                    "privateTags": (
                        "name=initial private key generated by command",
                        "key={}:{}".format(
                            hash_algo_name,
                            b64encode(
                                publicKey.encrypt(
                                    privkey_key,
                                    padding.OAEP(
                                        mgf=padding.MGF1(algorithm=hash_algo),
                                        algorithm=hash_algo,
                                        label=None,
                                    ),
                                )
                            ).decode("ascii"),
                        ),
                    ),
                    "publicTags": ["name=initial key generated by command"],
                    "publicState": "trusted",
                },
            },
        )
        with transaction.atomic():
            if not net.id:
                net.save()
            cluster = clusterfn()["cluster"]
            configEncoded = json.dumps(
                {
                    "baseUrl": url,
                    "configCluster": cluster.flexid_cached,
                    "certificates": {
                        publicKey_hash: {
                            "data": privateKey_b64,
                            "note": "initial certificate",
                        }
                    },
                    "tokens": {
                        view_key_hash: {
                            "data": view_key_b64,
                            "system": True,
                            "note": "config token",
                        },
                        manage_key_hash: {
                            "data": manage_key_b64,
                            "system": False,
                            "note": "initial token",
                        },
                    },
                    "hosts": {
                        url: {
                            "clusters": {
                                cluster.flexid_cached: {
                                    "hashes": {
                                        view_key_hash: ["view"],
                                        manage_key_hash: ["manage"],
                                        publicKey_hash: [],
                                    }
                                }
                            },
                            "contents": {},
                        }
                    },
                }
            )
            ecnryptedContent = AESGCM(config_shared_key).encrypt(
                nonce_config,
                configEncoded.encode("utf8"),
                None,
            )
            content = create_content_fn(
                request,
                {
                    "net": net,
                    "cluster": cluster,
                    "value": {
                        "value": ecnryptedContent,
                        "state": "internal",
                        "type": "Config",
                        "nonce": nonce_config,
                        "tags": [
                            "name=config.json",
                            f"key_hash={publicKey_hash}",
                        ],
                    },
                    "references": [
                        {
                            "target": publicKey_hash,
                            "group": "key",
                            "extra": "{}:{}".format(
                                hash_algo_name,
                                b64encode(
                                    publicKey.encrypt(
                                        config_shared_key,
                                        padding.OAEP(
                                            mgf=padding.MGF1(
                                                algorithm=hash_algo
                                            ),
                                            algorithm=hash_algo,
                                            label=None,
                                        ),
                                    )
                                ).decode("ascii"),
                            ),
                            "deleteRecursive": (
                                constants.DeleteRecursive.NO_GROUP
                            ),
                        },
                        {
                            "target": publicKey_hash,
                            "group": "signature",
                            "extra": "{}:{}".format(
                                hash_algo_name,
                                b64encode(
                                    privateKey.sign(
                                        ecnryptedContent,
                                        padding.PSS(
                                            mgf=padding.MGF1(hash_algo),
                                            salt_length=padding.PSS.MAX_LENGTH,
                                        ),
                                        hash_algo,
                                    )
                                ).decode("ascii"),
                            ),
                            "deleteRecursive": (
                                constants.DeleteRecursive.NO_GROUP
                            ),
                        },
                    ],
                    "contentHash": hash_object("type=Config"),
                },
                authset=[f"{cluster.flexid_cached}:{manage_key}"],
            )()["content"]
            search = urlencode(
                {
                    "token": "{}:{}".format(
                        cluster.flexid_cached,
                        view_key_b64,
                    ),
                    "key": [
                        "{}:{}".format(
                            publicKey_hash,
                            privkey_key_b64,
                        ),
                    ],
                },
                doseq=True,
            )
            print("{}?{}".format(urljoin(url, content.link), search))
