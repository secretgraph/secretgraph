import base64
import hashlib
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from graphql_relay import from_global_id
from django.conf import settings
from django.core.files.base import File, ContentFile
from django.utils import timezone
from django.db import transaction
from rdflib import Graph

from ...constants import sgraph_component
from ..actions.handler import ActionHandler
from ..models import (
    Action, Component, Content, ContentAction, ContentReference, ContentTag
)
# , ReferenceContent
from ..utils.auth import retrieve_allowed_objects

_serverside_encryption = getattr(
    settings, "SECRETGRAPH_SERVERSIDE_ENCRYPTION", False
)


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


def hash_key(key):
    return base64.b64encode(
        hashlib.new(
            settings.SECRETGRAPH_HASH_ALGORITHMS[0],
            key
        ).digest()
    ).decode("ascii")


def create_actions_func(component, actions, request):
    final_actions = []
    final_content_actions = []
    action_types = set()
    default_key = request.headers.get("Authorization", "").replace(
        " ", ""
    ).split(",", 1)[0].split(":", 1)[-1]
    try:
        default_key = base64.b64decode(default_key)
    except Exception:
        default_key = None
    for action in actions:
        action_key = action.get("key")
        if isinstance(action_key, bytes):
            pass
        elif isinstance(action_key, str):
            action_key = base64.base64_decode(action_key)
        elif default_key:
            action_key = default_key
        else:
            raise ValueError("No key specified/available")

        action_key_hash = hash_key(action_key)
        action_value = action["value"]
        if isinstance(str, action_value):
            action_value = json.loads(action_value)
        action_value = ActionHandler.clean_action(
            action["value"], request
        )

        # create Action object
        aesgcm = AESGCM(action_key)
        nonce = os.urandom(13)
        # add content_action
        _content_action = action_value.pop("content_action", None)
        if _content_action:
            final_content_actions.append(_content_action)

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
            content=_content_action
        )
        action.action_type = action_value["action"]
        action_types.add(action_value["action"])
        final_actions.append(action)

    def save_func():
        actions = retrieve_allowed_objects(
            request, "manage", component.actions.all()
        )
        ContentAction.objects.filter(action__in=actions).delete()
        actions.delete()
        ContentAction.objects.bulk_create(final_content_actions)
        component.actions.bulk_create(final_actions)
    setattr(save_func, "actions", final_actions)
    setattr(save_func, "content_actions", final_content_actions)
    setattr(save_func, "action_types", action_types)
    setattr(save_func, "key", default_key)
    return save_func


def _update_or_create_component(
    component, objdata, request
):
    if objdata.get("public_info"):
        g = Graph()
        g.parse(objdata["public_info"], "turtle")
        public_secret_hashes = set(map(hash_key, get_secrets(g)[0]))
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


def create_component(objdata, request, user=None):
    if not objdata.get("actions"):
        raise ValueError("Actions required")
    prebuild = {}

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        if not user:
            raise ValueError("No user specified")
    if user:
        prebuild["user"] = user
    return _update_or_create_component(
        Component(**prebuild), objdata, request
    )


def update_component(component, objdata, request, user=None):
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
        component, objdata, request
    )


def _update_or_create_content(content, objdata, request):
    if objdata["component"] != content.component:
        type_name, flexid = from_global_id(content.component.id)
        if type_name != "Component":
            raise ValueError("Requires Component id")
        content.component = retrieve_allowed_objects(
            request, "update", Component.objects.all()
        )["objects"].get(flexid=flexid)

    if objdata.get("value"):
        if not objdata.get("nonce"):
            raise ValueError("No nonce")
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

    create = not content.id

    final_info_tags = None
    if objdata.get("info") is not None:
        final_info_tags = []
        for i in objdata["info"]:
            final_info_tags.append(ContentTag(tag=i))

        if objdata.get("info_for_hash"):
            info_for_hash = set(filter(
                lambda x: not x.startswith("id="), objdata["info_for_hash"]
            ))
            if not info_for_hash.issubset(objdata.get("info")):
                raise ValueError("no subset of info")
            hashob = hashlib.new(settings.SECRETGRAPH_HASH_ALGORITHMS[0])
            for h in content.info_for_hash.sort():
                hashob.update(h.encode("utf8"))
            content.info_hash = \
                base64.b64encode(hashob.digest()).decode("ascii")
        else:
            content.info_hash = None
    elif not content.id:
        content.info_hash = None

    final_references = None
    if objdata.get("references") is not None:
        final_references = []
        for ref in objdata["references"]:
            ob = Content.objects.filter(
                flexid=ref.target, component_id=content.component_id
            ).first()
            if not ob:
                continue
            final_references.append(ContentReference(
                target=ob, group=ref.group or "",
            ))
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


def create_content(objdata, request):
    if not objdata.get("value"):
        raise ValueError("Requires value")
    return _update_or_create_content(
        Content(), objdata, request
    )


def update_content(content, objdata, request):
    if isinstance(content, str):
        type_name, flexid = from_global_id(content)
        if type_name != "Content":
            raise ValueError("Only for Contents")
        result = retrieve_allowed_objects(
            request, "update", Content.objects.all()
        )
        content = result["objects"].get(flexid=flexid)
    assert content.id
    return _update_or_create_content(
        content, objdata, request
    )
