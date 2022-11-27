import json
import os
from base64 import b64decode, b64encode
from urllib.parse import urlencode, urljoin

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.test.client import RequestFactory
from django.urls import reverse

from ...schema.arguments import ClusterInput


from ...actions.update import (
    create_cluster_fn,
    create_content_fn,
    ContentInput,
    ActionInput,
    ContentKeyInput,
    ReferenceInput,
    ContentValueInput,
)
from ...models import Net
from ...utils.hashing import hashTagsContentHash, hashObject
from ....core import constants


def _gen_key_vars_nohash(inp: bytes | str):
    if isinstance(inp, str):
        return (
            b64decode(inp),
            inp,
        )
    return inp, b64encode(inp).decode("ascii")


def _gen_key_vars(inp: bytes | str):
    ret = _gen_key_vars_nohash(inp)
    return *ret, hashObject(ret[0])


class Command(BaseCommand):
    help = "Initialize cluster"

    def add_arguments(self, parser):
        parser.add_argument(
            "--token", nargs="?", default=None, help="View token"
        )
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

    def handle(self, **options):
        if not options["token"]:
            options["token"] = b64encode(os.urandom(32)).decode("ascii")
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
        hash_algo, hash_algo_name = constants.mapHashNames[
            settings.SECRETGRAPH_HASH_ALGORITHMS[0]
        ]
        nonce_config = os.urandom(13)
        nonce_privkey = os.urandom(13)
        view_token, view_token_b64, view_token_hash = _gen_key_vars(
            options["token"]
        )
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

        url = reverse("graphql-plain")
        request = RequestFactory().get(url)
        clusterfn = create_cluster_fn(
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
                key=ContentKeyInput(
                    publicKey=publicKey_bytes,
                    publicState=options["public_key_state"],
                    privateKey=AESGCM(privkey_key).encrypt(
                        nonce_privkey, privateKey_bytes, None
                    ),
                    nonce=nonce_privkey,
                    privateTags=(
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
                    publicTags=["name=initial key generated by command"],
                ),
            ),
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
                            "signWith": True,
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
                }
            )
            ecnryptedContent = AESGCM(config_shared_key).encrypt(
                nonce_config,
                configEncoded.encode("utf8"),
                None,
            )
            content = create_content_fn(
                request,
                ContentInput(
                    net=net,
                    cluster=cluster,
                    value=ContentValueInput(
                        value=ecnryptedContent,
                        state="protected",
                        type="Config",
                        nonce=nonce_config,
                        tags=[
                            "name=config.json",
                            f"key_hash={publicKey_hash}",
                        ],
                    ),
                    references=[
                        ReferenceInput(
                            target=publicKey_hash,
                            group="key",
                            extra="{}:{}".format(
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
                            deleteRecursive=(
                                constants.DeleteRecursive.NO_GROUP
                            ),
                        ),
                        ReferenceInput(
                            target=publicKey_hash,
                            group="signature",
                            extra="{}:{}".format(
                                hash_algo_name,
                                b64encode(
                                    privateKey.sign(
                                        ecnryptedContent,
                                        padding.PSS(
                                            mgf=padding.MGF1(hash_algo),
                                            salt_length=padding.PSS.MAX_LENGTH,  # noqa E501
                                        ),
                                        hash_algo,
                                    )
                                ).decode("ascii"),
                            ),
                            deleteRecursive=(
                                constants.DeleteRecursive.NO_GROUP
                            ),
                        ),
                    ],
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
                        privkey_key_b64,
                    ),
                ],
            },
            doseq=True,
        )
        print("Cluster:", cluster.flexid_cached)
        print(
            "Initialization url: {}?{}".format(
                urljoin(url, content.link), search
            )
        )
