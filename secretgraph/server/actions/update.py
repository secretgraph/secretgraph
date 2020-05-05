import base64
import json
import logging
import os

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
from django.utils import timezone
from graphql_relay import from_global_id
from rdflib import RDF, BNode, Graph, Literal

from ...constants import sgraph_component, sgraph_key
from ..actions.handler import ActionHandler
from ..models import (
    Action, Component, Content, ContentAction, ContentReference, ContentTag
)
# , ReferenceContent
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
            ?n a component:EncryptedBox ;
                component:EncryptedBox.esecrets ?secret .
            OPTIONAL {  component:EncryptedBox.tasks ?task } .
        }
        """,
        initNs={
            "component": sgraph_component
        }
    ):
        if i.task:
            # hopefully the order is preserved
            protected_secrets.setdefault(i.secret, [])
            protected_secrets[i.secret].append(i.task)
        else:
            public_secrets.append(i.secret)
    return public_secrets, protected_secrets


def create_actions_func(component, actionlists, request):
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
                    component=component
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
                action_value, request
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
            request, "manage", component.actions.all()
        )
        # delete old actions in group if allowed
        actions = result["objects"].filter(
            Q(content_action__content__in=include_deletion) |
            Q(content_action=None) if None in include_deletion else Q()
        )
        ContentAction.objects.filter(
            action__in=actions
        ).delete()
        actions.delete()
        ContentAction.objects.bulk_create(final_content_actions)
        component.actions.bulk_create(final_actions)
    setattr(save_func, "actions", final_actions)
    setattr(save_func, "content_actions", final_content_actions)
    setattr(save_func, "action_types", action_types)
    setattr(save_func, "key", default_key)
    return save_func


def _transform_info_tags(objdata):
    info_tags = []
    key_hashes = set()
    for i in set(objdata.get("info") or []):
        if i.startswith("id="):
            logger.warning("id is an invalid tag (autogenerated)")
            continue
        if i == "key":
            raise ValueError("key is an invalid tag (autogenerated)")
        if i.startswith("key_hash="):
            keyhash = i.split("=")[-1]
            if len_default_hash == len(keyhash):
                key_hashes.add(keyhash)
        if len(i) > 8000:
            raise ValueError("Info tag too big")
        info_tags.append(ContentTag(tag=i))
    return info_tags, key_hashes


def _update_or_create_content_or_key(
    request, content, objdata, authset, is_key
):
    if objdata["component"] != content.component:
        type_name, flexid = from_global_id(content.component.id)
        if type_name != "Component":
            raise ValueError("Requires Component id")
        content.component = retrieve_allowed_objects(
            request, "update", Component.objects.all(), authset=authset
        )["objects"].get(flexid=flexid)

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

        def save_func():
            content.file.delete(False)
            content.file.save("", f)
    else:
        def save_func():
            content.save()

    final_info_tags = None
    if objdata.get("info") is not None:
        final_info_tags, key_hashes = _transform_info_tags(objdata)

        if is_key and len(key_hashes) < 2:
            raise ValueError(
                ">=1 key_hash info tags required for key (for action key)"
            )
        elif len(key_hashes) < 2:
            raise ValueError(
                ">=2 key_hash info tags required for content"
                " (for action and content key)"
            )
    else:
        key_hashes = set()

    chash = objdata.get("content_hash")
    if chash is not None:
        if len(chash) not in (0, len_default_hash):
            raise ValueError("Invalid hashing algorithm used for content_hash")
        if len(chash) == 0:
            content.content_hash = None
        else:
            content.content_hash = chash

    final_references = None
    keys_specified = False
    if objdata.get("references") is not None:
        final_references = []
        for ref in objdata["references"]:
            targetob = Content.objects.filter(
                flexid=ref.target, component_id=content.component_id,
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
                keys_specified = True
                if targetob.content_hash not in key_hashes:
                    raise ValueError("Key hash not found in info")
            final_references.append(refob)

    inner_key = objdata.get("key")
    if not keys_specified and inner_key:
        assert not is_key
        if isinstance(inner_key, str):
            inner_key = base64.b64decode(inner_key)
        # last resort
        if create:
            for key in retrieve_allowed_objects(
                request, "view", Content.objects.filter(
                    info__tag="key",
                    component_id=content.component_id
                ),
                authset=authset
            )["objects"]:
                refob = ContentReference(
                    target=targetob, group="key", delete_recursive=None,
                    extra=key.encrypt(
                        inner_key,
                        default_padding
                    )
                )
                final_references.append(refob)
    with transaction.atomic():
        save_func()
        if final_info_tags is not None:
            # simply ignore id=, can only be changed in regenerateFlexid
            # ignore key which cannot be stripped
            content.info.exclude(
                Q(startswith="id=") |
                Q(startswith="key")
            ).delete()
            content.info.create_bulk(final_info_tags)

        # create id tag after object was created or update it
        content.info.update_or_create(
            defaults={"tag": f"id={content.flexid}"},
            tag__startswith="id="
        )
        if is_key:
            content.info.get_or_create(tag="key")
        if final_references is not None:
            content.references.delete()
            content.references.create_bulk(final_references)
    return content


def create_content(request, objdata, key=None, authset=None):
    value_obj = objdata.get("value")
    key_obj = objdata.get("key")
    if not value_obj and not key_obj:
        raise ValueError("Requires value or key")
    if value_obj and key_obj:
        raise ValueError("Can only specify one of value or key")

    is_key = False
    if key_obj:
        is_key = True
        if isinstance(key_obj["private_key"], str):
            key_obj["private_key"] = base64.b64decode(key_obj["private_key"])
        if isinstance(key_obj["public_key"], str):
            key_obj["public_key"] = base64.b64decode(key_obj["public_key"])
        if isinstance(key_obj["nonce"], str):
            key_obj["nonce"] = base64.b64decode(key_obj["nonce"])
        if key:
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
        g = Graph()
        key_node = BNode()
        g.add((
            key_node,
            RDF.type,  # = a
            sgraph_key["Key"]
        ))
        g.add((
            key_node,
            sgraph_key["Key.public_key"],
            Literal(key_obj["public_key"])
        ))
        g.add((
            key_node,
            sgraph_key["Key.private_key"],
            Literal(key_obj["private_key"])
        ))

        hashes = calculate_hashes(key_obj["public_key"])
        info = list(map(
            lambda x: f"keyhash={x}", hashes
        ))
        info.extend(objdata.get("info") or [])

        newdata = {
            "nonce": key_obj["nonce"],
            "value": g.serialize("turtle"),
            "info": info,
            "content_hash": hashes[0]
        }
    else:
        newdata = {
            "component": objdata.get("component"),
            "references": objdata.get("references"),
            "content_hash": objdata.get("content_hash"),
            "info": objdata.get("info"),
            "key": key,
            **value_obj
        }
    return _update_or_create_content_or_key(
        request, Content(), newdata, authset, is_key
    )


def update_content(
    request, content, objdata, key=None, authset=None
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
    if content.info.filter(tag="key"):
        is_key = True
        key_obj = objdata.get("key")
        if not key_obj:
            raise ValueError("Cannot transform key to content")
        if isinstance(key_obj["private_key"], str):
            key_obj["private_key"] = base64.b64decode(key_obj["private_key"])
        if isinstance(key_obj["public_key"], str):
            key_obj["public_key"] = base64.b64decode(key_obj["public_key"])
        if isinstance(key_obj["nonce"], str):
            key_obj["nonce"] = base64.b64decode(key_obj["nonce"])
        if key:
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
        g = Graph()
        g.parse(file=content.value.open("rb"))
        key_node, old_pubkey = next(
            g.subject_objects(sgraph_key["Key.public_key"])
        )
        if old_pubkey.toPython() != key_obj["public_key"]:
            raise ValueError("Cannot change public key")
        g.set((
            key_node,
            sgraph_key["Key.private_key"],
            Literal(key_obj["private_key"])
        ))
        hashes = calculate_hashes(key_obj["public_key"])
        info = list(map(
            lambda x: f"keyhash={x}", hashes
        ))
        info.extend(objdata.get("info") or [])

        newdata = {
            "nonce": key_obj["nonce"],
            "value": g.serialize("turtle"),
            "info": info,
            "content_hash": hashes[0]
        }
    else:
        newdata = {
            "component": objdata.get("component"),
            "key": key,
            **objdata["value"]
        }
    return _update_or_create_content_or_key(
        request, content, newdata, authset, is_key
    )


def _update_or_create_component(
    request, component, objdata
):
    if objdata.get("public_info"):
        g = Graph()
        g.parse(objdata["public_info"], "turtle")
        public_secret_hashes = set(map(hash_object, get_secrets(g)[0]))
        component.public_info = objdata["public_info"]
        component.public = len(public_secret_hashes) > 0
    elif component.id is not None:
        public_secret_hashes = {}
    else:
        raise ValueError("no public info")

    if objdata.get("actions"):
        created = not component.id
        action_save_func = create_actions_func(
            component, objdata["actions"], request
        )
        assert created and not component.id, \
            "Don't save component in action clean"

        m_actions = filter(
            lambda x: x.action_type == "manage", action_save_func.actions
        )
        m_actions = set(map(lambda x: x.key_hash, m_actions))

        if created and "manage" not in action_save_func.action_types:
            raise ValueError("Requires \"manage\" Action")

        if m_actions.intersection(public_secret_hashes):
            raise ValueError("\"manage\" action cannot be public")

        with transaction.atomic():
            component.save()
            action_save_func()
    elif component.id is not None and not public_secret_hashes:
        component.save()
    else:
        raise ValueError("no actions for new component")
    return component


def create_component(request, objdata=None, key=None, user=None):
    prebuild = {}

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        if not user:
            raise ValueError("No user specified")
    if user:
        prebuild["user"] = user
    action_key = None
    private_key = None
    if not objdata:
        action_key = os.urandom(32)
        encrypted_value =""
        objdata = {
            "actions": [
                {
                    "key": action_key,
                    "value": encrypted_value
                }
            ]
        }
        raise NotImplementedError
    if not objdata.get("actions"):
        raise ValueError("Actions required")
    contentdata = {}
    if not objdata.get("key"):
        if not key:
            key = os.urandom(32)
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
    component = _update_or_create_component(
        request, Component(**prebuild), objdata
    )
    contentdata["component"] = component
    try:
        create_content(
            request, contentdata, key=key,
            authset=[
                ":".join([component.flexid, base64.b64encode(action_key)])
            ]
        )
    except Exception as exc:
        component.delete()
        raise exc

    return (
        component,
        action_key,
        private_key,
        key
    )


def update_component(request, component, objdata, user=None):
    if isinstance(component, str):
        type_name, flexid = from_global_id(component)
        if type_name != "Component":
            raise ValueError("Only for Components")
        result = retrieve_allowed_objects(
            request, "update", Component.objects.all()
        )
        component = result["objects"].get(flexid=flexid)
    assert component.id
    if user:
        component.user = user

    return _update_or_create_component(
        request, component, objdata
    )
