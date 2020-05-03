import base64
import json
import logging
import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
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
from rdflib import Graph, BNode, Literal, RDF

from ...constants import sgraph_component, sgraph_key
from ..actions.handler import ActionHandler
from ..models import (
    Action, Component, Content, ContentAction, ContentReference, ContentTag
)
# , ReferenceContent
from ..utils.auth import retrieve_allowed_objects
from ..utils.misc import calculate_hashes, hash_object
from ..utils.encryption import default_padding


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


def create_component(request, objdata=None, user=None):
    if not objdata.get("actions"):
        raise ValueError("Actions required")
    prebuild = {}

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        if not user:
            raise ValueError("No user specified")
    if user:
        prebuild["user"] = user
    if not objdata:
        objdata = {

        }
        raise NotImplementedError
    return _update_or_create_component(
        request, Component(**prebuild), objdata
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


def _update_or_create_content_or_key(
    request, content, objdata, authset, min_key_hashes, is_key
):
    if objdata["component"] != content.component:
        type_name, flexid = from_global_id(content.component.id)
        if type_name != "Component":
            raise ValueError("Requires Component id")
        content.component = retrieve_allowed_objects(
            request, "update", Component.objects.all(), authset=authset
        )["objects"].get(flexid=flexid)

    create = not content.id

    final_info_tags = None
    key_hashes = set()
    if objdata.get("info") is not None:
        final_info_tags = []
        count_key_hash_info = 0
        for i in objdata["info"]:
            if not is_key and i == "key":
                raise ValueError("key is invalid tag for content")
            if i.startswith("key_hash="):
                keyhash = i.split("=")[-1]
                if len_default_hash == len(keyhash):
                    key_hashes.add(keyhash)
                    count_key_hash_info += 1
            if len(i) > 8000:
                raise ValueError("Info tag too big")
            final_info_tags.append(ContentTag(tag=i))
        if count_key_hash_info < 1:
            raise ValueError("No key_hash info")
        elif count_key_hash_info < min_key_hashes:
            logging.debug("Lacks %d key_hash", min_key_hashes)
    elif create:
        # if content does not exist, skip info tag creation
        final_info_tags = None

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
            raise ValueError("No nonce")
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
    with transaction.atomic():
        save_func()
        if final_info_tags is not None:
            # simply ignore id=, can only be changed in regenerateFlexid
            content.info.exclude(startswith="id=").delete()
            content.info.create_bulk(final_info_tags)
        # but create it after object was created
        if create:
            content.info.create(
                tag=f"id={content.flexid}"
            )
        if final_references is not None:
            content.references.delete()
            content.references.create_bulk(final_references)
    return content


def create_content(request, objdata, key=None, authset=None, min_key_hashes=2):
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
        pubkey = load_der_public_key(
            key_obj["public_key"], None, default_backend()
        )
        key_obj["public_key"] = pubkey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
            encryption_algorithm=serialization.NoEncryption()
        )
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
        # -1: one hash was specified (the one of the key)
        min_key_hashes -= 1
        info.append("key")
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
        request, Content(), newdata, authset, min_key_hashes, is_key
    )


def update_content(
    request, content, objdata, key=None, authset=None, min_key_hashes=2
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
    if content.info.filter(tag="key"):
        # TODO: allow updating encrypted private key if public key matches
        raise ValueError("Cannot update key")
    newdata = {
        "component": objdata.get("component"),
        "key": key,
        **objdata["value"]
    }
    return _update_or_create_content_or_key(
        request, content, newdata, authset, min_key_hashes, None
    )
