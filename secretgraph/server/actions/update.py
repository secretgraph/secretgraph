import base64
import hashlib
import json
import logging
import os

import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import (
    load_der_private_key, load_der_public_key
)
from django.conf import settings
from django.core.files.base import ContentFile, File
from django.db import transaction
from django.db.models import Q
from django.test import Client
from django.utils import timezone
from graphql_relay import from_global_id
from rdflib import RDF, XSD, BNode, Graph, Literal

from ...constants import sgraph_cluster
from ..actions.handler import ActionHandler
from ..models import (
    Action, Cluster, Content, ContentAction, ContentReference, ContentTag
)
from ..utils.auth import retrieve_allowed_objects
from ..utils.encryption import default_padding, encrypt_into_file
from ..utils.misc import calculate_hashes, hash_object

logger = logging.getLogger(__name__)

len_default_hash = len(hash_object(b""))


def get_secrets(graph):
    public_secrets = []
    protected_secrets = {}
    # tasks must not be distinct
    for i in graph.query(
        """
        SELECT ?secret ?task
        WHERE {
            ?n a cluster:EncryptedBox ;
                cluster:EncryptedBox.secrets ?secret .
            OPTIONAL {  cluster:EncryptedBox.tasks ?task } .
        }
        """,
        initNs={
            "cluster": sgraph_cluster
        }
    ):
        if i.task:
            # hopefully the order is preserved
            protected_secrets.setdefault(i.secret, [])
            protected_secrets[i.secret].append(i.task)
        else:
            public_secrets.append(i.secret)
    return public_secrets, protected_secrets


def create_actions_func(cluster, actionlists, request, addonly=False):
    final_actions = []
    final_content_actions = []
    action_types = set()
    include_deletion = set()
    default_key = request.headers.get("Authorization", "").replace(
        " ", ""
    ).split(",", 1)[0].split(":", 1)[-1]
    try:
        default_key = base64.b64decode(default_key)
    except Exception:
        default_key = None
    for actionlist in actionlists:
        content = actionlist.get("content")
        if content:
            if isinstance(content, str):
                type_name, id = from_global_id(content)
                if type_name != "Content":
                    raise ValueError("Invalid type, requires content")
                content = Content.objects.get(
                    mark_for_destruction=None, flexid=id,
                    cluster=cluster
                )
                include_deletion.add(content.id)
        else:
            include_deletion.add(None)
        for action in actionlist.get("actions") or []:
            action_key = action.get("key")
            if isinstance(action_key, bytes):
                pass
            elif isinstance(action_key, str):
                action_key = base64.base64_decode(action_key)
            elif default_key:
                action_key = default_key
            else:
                raise ValueError("No key specified/available")

            action_key_hash = hash_object(action_key)
            action_value = action["value"]
            if isinstance(str, action_value):
                action_value = json.loads(action_value)
            action_value = ActionHandler.clean_action(
                action_value, request, content
            )

            # create Action object
            aesgcm = AESGCM(action_key)
            nonce = os.urandom(13)
            # add content_action
            group = action_value.pop("content_action_group") or ""
            if content:
                c = ContentAction(
                    content=content,
                    group=group
                )
                final_content_actions.append(c)

            action = Action(
                value=aesgcm.encode(
                    nonce,
                    json.dumps(action_value).encode("utf-8"),
                    None
                ),
                start=action.get("start", timezone.now()),
                stop=action.stop,
                key_hash=action_key_hash,
                nonce=base64.b64encode(nonce).decode("ascii"),
                content_action=c
            )
            action.action_type = action_value["action"]
            action_types.add(action_value["action"])
            final_actions.append(action)

    def save_func():
        result = retrieve_allowed_objects(
            request, "manage", cluster.actions.all()
        )
        if not addonly:
            # delete old actions in group if allowed
            # content==null does not exist so None in set does no harm
            actions = result["objects"].filter(
                Q(content_action__content__in=include_deletion) |
                Q(content_action=None) if None in include_deletion else Q()
            )
            ContentAction.objects.filter(
                action__in=actions
            ).delete()
            actions.delete()
        ContentAction.objects.bulk_create(final_content_actions)
        cluster.actions.bulk_create(final_actions)
    setattr(save_func, "actions", final_actions)
    setattr(save_func, "content_actions", final_content_actions)
    setattr(save_func, "action_types", action_types)
    setattr(save_func, "key", default_key)
    return save_func


def create_action_for_content(content, definition, request):
    cluster = content.cluster
    key = os.urandom(32)
    actionlists = [{
        "content": content,
        "actions": [{
            "key": key,
            "value": definition
        }]
    }]
    create_actions_func(cluster, actionlists, request, addonly=True)()
    return key


def transform_key_into_dataobj(key_obj, key=None, content=None):
    if isinstance(key_obj.get("private_key"), str):
        key_obj["private_key"] = base64.b64decode(key_obj["private_key"])
    if isinstance(key_obj["public_key"], str):
        key_obj["public_key"] = base64.b64decode(key_obj["public_key"])
    if isinstance(key_obj["nonce"], str):
        key_obj["nonce"] = base64.b64decode(key_obj["nonce"])
    if key and key_obj.get("private_key"):
        aesgcm = AESGCM(key)
        privkey = aesgcm.decrypt(
            key_obj["private_key"],
            key_obj["nonce"],
            None
        )
        privkey = load_der_private_key(privkey, None, default_backend())
        key_obj["private_key"] = aesgcm.encrypt(
            privkey.private_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ),
            key_obj["nonce"],
            None
        )

        key_obj["public_key"] = privkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
            encryption_algorithm=serialization.NoEncryption()
        )
    else:
        try:
            pubkey = load_der_public_key(
                key_obj["public_key"], None, default_backend()
            )
            key_obj["public_key"] = pubkey.public_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
                encryption_algorithm=serialization.NoEncryption()
            )
        except Exception as exc:
            # logger.debug("loading public key failed", exc_info=exc)
            raise ValueError("Invalid public key") from exc
    if content:
        if content.value.open("rb").read() != key_obj["public_key"]:
            raise ValueError("Cannot change public key")
    hashes = calculate_hashes(key_obj["public_key"])
    info = list(map(
        lambda x: f"key_hash={x}", hashes
    ))

    return (
        {
            "nonce": key_obj["nonce"],
            "value": key_obj["public_key"],
            "info": ["public_key"].extend(info),
            "content_hash": hashes[0]
        },
        {
            "nonce": key_obj["nonce"],
            "value": key_obj["private_key"],
            "info": ["private_key"].extend(info),
            "content_hash": hashes[0]
        } if key_obj.get("private_key") else None
    )


def _transform_info_tags(objdata, is_key):
    info_tags = []
    key_hashes = set()
    for i in set(objdata.get("info") or []):
        if i.startswith("id="):
            logger.warning("id is an invalid tag (autogenerated)")
            continue
        elif not is_key and i in {"public_key", "private_key"}:
            raise ValueError("key is an invalid tag (autogenerated)")
        elif i.startswith("key_hash="):
            key_hash = i.split("=")[-1]
            if len_default_hash == len(key_hash):
                key_hashes.add(key_hash)
        if len(i) > 8000:
            raise ValueError("Info tag too big")
        info_tags.append(ContentTag(tag=i))
    return info_tags, key_hashes


def _update_or_create_content_or_key(
    request, content, objdata, authset, is_key, default_keys, required_keys
):
    if isinstance(objdata["cluster"], str):
        type_name, objdata["cluster"] = from_global_id(objdata["cluster"])
        if type_name != "Cluster":
            raise ValueError("Requires Cluster id")
        content.cluster = retrieve_allowed_objects(
            request, "update", Cluster.objects.filter(
                flexid=objdata["cluster"]
            ), authset=authset
        )["objects"].get(flexid=objdata["cluster"])
    else:
        content.cluster = objdata["cluster"]

    create = not content.id

    # if create checked in parent function
    if objdata.get("value"):
        # normalize nonce and check constraints
        try:
            if isinstance(objdata["nonce"], bytes):
                checknonce = objdata["nonce"]
                objdata["nonce"] = base64.b64encode(checknonce)
            else:
                checknonce = base64.b64decode(objdata["nonce"])
        except Exception:
            # no nonce == trigger encryption
            objdata["value"], objdata["nonce"], objdata["key"] = \
                encrypt_into_file(
                    objdata["value"],
                    key=objdata.get("key") or None
                )
        if len(checknonce) != 13:
            raise ValueError("invalid nonce size")
        if checknonce.count(b"\0") == len(checknonce):
            raise ValueError("weak nonce")
        content.nonce = objdata["nonce"]

        if isinstance(objdata["value"], bytes):
            f = ContentFile(objdata["value"])
        elif isinstance(objdata["value"], str):
            f = ContentFile(base64.b64decode(objdata["value"]))
        else:
            f = File(objdata["value"])

        def save_func_value():
            content.file.delete(False)
            content.file.save("", f)
    else:
        def save_func_value():
            content.save()

    final_info_tags = None
    if objdata.get("info") is not None:
        final_info_tags, key_hashes_info = \
            _transform_info_tags(objdata, is_key)
    else:
        key_hashes_info = set()

    chash = objdata.get("content_hash")
    if chash is not None:
        if len(chash) not in (0, len_default_hash):
            raise ValueError("Invalid hashing algorithm used for content_hash")
        if len(chash) == 0:
            content.content_hash = None
        else:
            content.content_hash = chash

    final_references = None
    key_hashes_ref = set()
    if objdata.get("references") is not None:
        final_references = []
        for ref in objdata["references"]:
            if isinstance(ref["target"], Content):
                targetob = ref["target"]
            else:
                targetob = Content.objects.filter(
                    Q(id=ref["target"]) |
                    Q(flexid=ref["target"]),
                    mark_for_destruction=None
                ).first()
            if not targetob:
                continue
            if ref.get("extra") and len(ref["extra"]) > 8000:
                raise ValueError("Extra tag too big")
            refob = ContentReference(
                target=targetob, group=ref.get("group") or "",
                extra=ref.get("extra") or ""
            )
            if refob.group == "key":
                refob.delete_recursive = None
                key_hashes_ref.add(targetob.content_hash)
                if targetob.content_hash not in key_hashes_info:
                    raise ValueError("Key hash not found in info")
            final_references.append(refob)
    elif create:
        final_references = []

    inner_key = objdata.get("key")
    if not key_hashes_ref and inner_key and default_keys:
        assert not is_key
        if isinstance(inner_key, str):
            inner_key = base64.b64decode(inner_key)
        # last resort
        if final_references is not None:
            if callable(default_keys):
                default_keys = default_keys()
            for keyob in default_keys:
                refob = ContentReference(
                    target=keyob, group="key", delete_recursive=None,
                    extra=keyob.encrypt(
                        inner_key,
                        default_padding
                    )
                )
                final_references.append(refob)
                key_hashes_info.add(keyob.content_hash)
                final_info_tags.append(ContentTag(
                    tag=f"key_hash={keyob.content_hash}"
                ))

    if is_key and len(key_hashes_info) < 1:
        raise ValueError(
            ">=1 key_hash info tags required for key (for action key)"
        )
    elif not is_key and len(key_hashes_ref) < 1:
        raise ValueError(
            ">=1 key required for content"
        )
    elif len(key_hashes_info) < 2:
        raise ValueError(
            "missing key_hash info tag (for action key)"
        )
    elif not key_hashes_info.issuperset(required_keys):
        raise ValueError(
            "missing required keys"
        )

    def save_func():
        save_func_value()
        if final_info_tags is not None:
            # simply ignore id=, can only be changed in regenerateFlexid
            if not create:
                content.info.exclude(
                    Q(startswith="id=")
                ).delete()
            content.info.create_bulk(final_info_tags)

        # create id tag after object was created or update it
        content.info.update_or_create(
            defaults={"tag": f"id={content.flexid}"},
            tag__startswith="id="
        )
        if final_references is not None:
            if not create:
                if is_key:
                    refs = content.references.exclude(group="private_key")
                else:
                    refs = content.references.all()
                refs.delete()
            content.references.create_bulk(final_references)
    return content
    return save_func


def create_key_func(
    request, objdata, key=None, authset=None
):
    key_obj = objdata.get("key")
    if not key_obj:
        raise ValueError("Requires key")

    public, private = transform_key_into_dataobj(key_obj, key=key)
    public_content = Content()
    public["info"].extend(objdata.get("info") or [])
    public = _update_or_create_content_or_key(
        request, public_content, public, authset, True, None, []
    )
    if private:
        private["info"].extend(objdata.get("info") or [])
        private["references"].append({
            "target": public_content,
            "group": "private_key",
            "delete_recursive": False
        })
        private = _update_or_create_content_or_key(
            request, Content(), private, authset, True, None, []
        )
    else:
        def private():
            return None
    return public, private


def create_content(
    request, objdata, key=None, authset=None,
    default_keys=None, required_keys=None
):
    value_obj = objdata.get("value")
    key_obj = objdata.get("key")
    if not value_obj and not key_obj:
        raise ValueError("Requires value or key")
    if value_obj and key_obj:
        raise ValueError("Can only specify one of value or key")

    is_key = False
    if key_obj:
        is_key = True
        public, private = create_key_func(
            request, objdata, key=key, authset=authset
        )

        with transaction.atomic():
            private()
            return public()
    else:
        newdata = {
            "cluster": objdata.get("cluster"),
            "references": objdata.get("references"),
            "content_hash": objdata.get("content_hash"),
            "info": objdata.get("info"),
            "key": key,
            **value_obj
        }

        with transaction.atomic():
            _update_or_create_content_or_key(
                request, Content(), newdata, authset, is_key,
                default_keys, required_keys or []
            )()


def update_content(
    request, content, objdata, key=None, authset=None,
    default_keys=None, required_keys=None
):
    if isinstance(content, str):
        type_name, flexid = from_global_id(content)
        if type_name != "Content":
            raise ValueError("Only for Contents")
        result = retrieve_allowed_objects(
            request, "update", Content.objects.all(),
            authset=authset
        )
        content = result["objects"].get(flexid=flexid)
    assert content.id
    is_key = False
    if content.info.filter(tag="public_key"):
        is_key = True
        key_obj = objdata.get("key")
        if not key_obj:
            raise ValueError("Cannot transform key to content")

        new_data = transform_key_into_dataobj(
            key_obj, key=key, content=content
        )[0]
        new_data["info"].extend(objdata.get("info") or [])
    elif content.info.filter(tag="private_key"):
        is_key = True
        key_obj = objdata.get("key")
        if not key_obj:
            raise ValueError("Cannot transform key to content")

        new_data = transform_key_into_dataobj(
            key_obj, key=key, content=content
        )[1]
        if not new_data:
            raise ValueError()
        new_data["info"].extend(objdata.get("info") or [])
    else:
        newdata = {
            "cluster": objdata.get("cluster"),
            "key": key,
            **objdata["value"]
        }
    func = _update_or_create_content_or_key(
        request, content, newdata, authset, is_key,
        default_keys, required_keys or []
    )
    with transaction.atomic():
        return func()


def transfer_value(request, content, url, headers):
    raise NotImplementedError()
    params, inline_domain = None, None
    # get_requests_params(url)
    if inline_domain:
        response = Client().get(
            url,
            Connection="close",
            SERVER_NAME=inline_domain,
            **headers
        )
        if response.status_code != 200:
            raise ValueError()
    else:
        try:
            with requests.get(
                url,
                headers={
                    "Connection": "close",
                    **headers
                },
                **params
            ):
                pass
        except Exception:
            pass


def _update_or_create_cluster(
    request, cluster, objdata
):
    if objdata.get("public_info"):
        g = Graph()
        g.parse(objdata["public_info"], "turtle")
        public_secret_hashes = set(map(hash_object, get_secrets(g)[0]))
        cluster.public_info = objdata["public_info"]
        cluster.public = len(public_secret_hashes) > 0
    elif cluster.id is not None:
        public_secret_hashes = {}
    else:
        raise ValueError("no public info")

    if objdata.get("actions"):
        created = not cluster.id
        action_save_func = create_actions_func(
            cluster, objdata["actions"], request, created
        )
        assert created and not cluster.id, \
            "Don't save cluster in action clean"

        m_actions = filter(
            lambda x: x.action_type == "manage", action_save_func.actions
        )
        m_actions = set(map(lambda x: x.key_hash, m_actions))

        if created and "manage" not in action_save_func.action_types:
            raise ValueError("Requires \"manage\" Action")

        if m_actions.intersection(public_secret_hashes):
            raise ValueError("\"manage\" action cannot be public")

        def save_func():
            cluster.save()
            action_save_func()
            return cluster
    elif cluster.id is not None and not public_secret_hashes:
        def save_func():
            cluster.save()
            return cluster
    else:
        raise ValueError("no actions for new cluster")
    return save_func


def create_cluster(
    request, objdata=None, key=None, pw=None, user=None, authset=None
):
    prebuild = {}

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        if not user:
            raise ValueError("No user specified")
    if user:
        prebuild["user"] = user
    action_key = None
    private_key = None
    if not objdata.get("key"):
        if not key:
            key = os.urandom(32)
    if not isinstance(objdata, dict):
        action_key = os.urandom(32)
        objdata = {
            "actions": [
                {
                    "key": action_key,
                    "value": {
                        "action": "manage"
                    }
                }
            ]
        }
        g = Graph()
        root = BNode()
        g.add((root, RDF.type, sgraph_cluster["Cluster"]))
        if pw:
            salt = os.urandom(16)
            hashed_pw = hashlib.pbkdf2_hmac(
                'sha256', pw.encode("utf8"), salt, 250000
            )
            aesgcm = AESGCM(hashed_pw)

            b2 = BNode()
            g.add((root, sgraph_cluster["Cluster.boxes"], b2))
            g.add((
                b2,
                sgraph_cluster["Cluster.tasks"],
                Literal(f"pw:{salt}", datatype=XSD.string)
            ))
            for k, ktype in [(action_key, b"manage"), (key, b"")]:
                if not k:
                    continue
                nonce = os.urandom(13)

                encrypted_secret = aesgcm.encrypt(
                    b"%b:%b" % (
                        ktype,
                        base64.b64encode(k)
                    ), nonce, None
                )
                encrypted_secret = "{}:{}".format(
                    base64.b64encode(nonce).decode("ascii"),
                    base64.b64encode(encrypted_secret).decode("ascii")
                )
                g.add((
                    b2,
                    sgraph_cluster["Cluster.secrets"],
                    Literal(encrypted_secret, datatype=XSD.string)
                ))
        objdata["public_info"] = g.serialize(format="turtle")

    if not objdata.get("actions"):
        raise ValueError("Actions required")
    contentdata = {}
    if not objdata.get("key"):
        aesgcm = AESGCM(key)
        nonce = os.urandom(13)
        private_key = generate_private_key(
            public_exponent=65537,
            key_size=4096,
            backend=default_backend()
        )
        contentdata["key"] = {
            "nonce": nonce,
            "private_key": aesgcm.encrypt(
                private_key.private_bytes(
                    encoding=serialization.Encoding.DER,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption()
                ),
                nonce,
                None
            ),
            "public_key": private_key.public_bytes(
                encoding=serialization.Encoding.DER,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
                encryption_algorithm=serialization.NoEncryption()
            )
        }

    else:
        contentdata["key"] = objdata["key"]
    cluster = Cluster(**prebuild)
    cluster_func = _update_or_create_cluster(
        request, cluster, objdata
    )
    contentdata["cluster"] = cluster
    content_func = create_key_func(
        request, contentdata, key=key, authset=authset
    )
    with transaction.atomic():
        content_func()
        cluster = cluster_func()

    return (
        cluster,
        action_key,
        private_key,
        key
    )


def update_cluster(request, cluster, objdata, user=None):
    if isinstance(cluster, str):
        type_name, flexid = from_global_id(cluster)
        if type_name != "Cluster":
            raise ValueError("Only for Clusters")
        result = retrieve_allowed_objects(
            request, "update", Cluster.objects.all()
        )
        cluster = result["objects"].get(flexid=flexid)
    assert cluster.id
    if user:
        cluster.user = user

    return _update_or_create_cluster(
        request, cluster, objdata
    )()
