import base64
import hashlib
import json
import os

import graphene
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.core.files.base import File
from django.db import transaction
from graphene import relay
from graphene_file_upload.scalars import Upload
from rdflib import Graph

from ...constants import sgraph_component
from ..actions.handler import ActionHandler
from ..models import (
    Action, Component, Content, ContentAction, ContentReference, ContentTag
)
# , ReferenceContent
from ..signals import generateFlexid
from ..utils.auth import retrieve_allowed_objects
from .arguments import ComponentInput, ContentInput
from .definitions import ComponentNode, ContentNode, FlexidType

_serverside_encryption = getattr(
    settings, "SECRETGRAPH_SERVERSIDE_ENCRYPTION", False
)


def _is_public(graph):
    for i in graph.query(
        """
        SELECT DISTINCT (COUNT(?tasks) AS ?ctasks)
        WHERE {
            ?n a component:EncryptedBox ;
                component:EncryptedBox.esecrets ?secrets .
                component:EncryptedBox.tasks ?tasks .
        }
        """,
        initNs={
            "component": sgraph_component
        }
    ):
        if i.tasks == 0:
            return True
    return False


class ComponentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        component = ComponentInput(required=True)

    component = graphene.Field(ComponentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, component_id, component):
        idpart = cls.from_global_id(component_id)[1]
        g = Graph()
        g.parse(component.public_info, "turtle")
        if idpart:
            _component = retrieve_allowed_objects(
                info, "manage", Component.objects.all()
            ).get(flexid=idpart)
            _component.public_info = component.public_info
            _component.public = _is_public(g)
            # TODO: admin permission
            # if info.context.user.has_perm("TODO") and user:
            #     prebuild["user"] = cls.from_global_id(user)[1]
            component.save(update_fields=["public_info", "nonce", "public"])
        else:
            if not component.actions:
                raise ValueError("Actions required")
            prebuild = {
                "public_info": component.public_info,
                "public": _is_public(g)
            }
            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if not info.context.user.is_authenticated:
                    raise
                prebuild["user"] = info.context.user
            # TODO: admin permission
            # if info.context.user.has_perm("TODO") and user:
            #     prebuild["user"] = cls.from_global_id(user)[1]
            _component = Component.objects.create(**prebuild)
        if component.actions:
            final_actions = []
            final_content_actions = []
            for action in component.actions:
                key = base64.base64_decode(action.key)
                action_value = ActionHandler.clean_action(
                    json.loads(action.value), info
                )
                aesgcm = AESGCM(key)
                nonce = os.urandom(13)
                halgo = hashlib.new(settings.SECRETGRAPH_HASH_ALGORITHMS[0])
                _content_action = action_value.pop("content_action", None)
                if _content_action:
                    final_content_actions.append(_content_action)

                final_actions.append(Action(
                    value=aesgcm.encode(
                        nonce,
                        json.dumps(action_value).encode("utf-8"),
                        None
                    ),
                    start=action.start,
                    stop=action.stop,
                    hash_algo=base64.b64encode(halgo.update(
                        key
                    ).digest()).decode("ascii"),
                    nonce=base64.b64encode(nonce).decode("ascii"),
                    content=_content_action
                ))

            with transaction.atomic():
                actions = retrieve_allowed_objects(
                    info, "manage", _component.actions.all()
                )
                ContentAction.objects.filter(action__in=actions).delete()
                actions.delete()
                ContentAction.objects.bulk_create(final_content_actions)
                _component.actions.bulk_create(final_actions)
        return cls(component=_component)


class RegenerateFlexidMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)

    node = graphene.Field(FlexidType)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id):
        _type, flexid = cls.from_global_id(id)
        if _type == "Component":
            objects = Component.objects.all()
        elif _type == "Content":
            objects = Content.objects.all()
        else:
            raise ValueError()
        objects = retrieve_allowed_objects(info, "update", objects)
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        obj = objects.get(flexid=flexid)
        generateFlexid(objects.model, obj, True)
        return cls(node=obj)


class ContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        content = graphene.Field(ContentInput, required=True)
        info_for_hash = graphene.List(graphene.String, required=False)
        key = graphene.String(required=_serverside_encryption)

    content = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, id, content, info_for_hash, value, key
    ):
        if id:
            result = retrieve_allowed_objects(
                info, "update", Content.objects.all()
            )
            _content = result["objects"].get(flexid=cls.from_global_id(id)[1])
        else:
            if not value:
                raise ValueError("no value")
            result = retrieve_allowed_objects(
                info, "update", Component.objects.all()
            )
            _component = result["objects"].get(
                flexid=cls.from_global_id(content.component.id)[1]
            )
            _content = Content(component=_component, nonce=content.nonce)

        if content.component != _content.component:
            _component = retrieve_allowed_objects(
                info, "update", Component.objects.all()
            )["objects"].get(
                flexid=cls.from_global_id(content.component.id)[1]
            )
            _content.component = _component
        if content.info_for_hash:
            if not set(content.info_for_hash).issubset(content.info):
                raise ValueError("no subset of info")
            hashob = hashlib.new(settings.SECRETGRAPH_HASH_ALGORITHMS[0])
            for h in content.info_for_hash.sort():
                hashob.update(h.encode("utf8"))
            _content.info_hash = \
                base64.b64encode(hashob.digest()).decode("ascii")
        else:
            _content.info_hash = None

        if value:
            if not content.nonce:
                raise ValueError()
            _content.nonce = content.nonce
            _content.file.delete(False)
            _content.file.save("", File(value))
        else:
            _content.save()
        final_info_tags = [ContentTag(tag=f"id={_content.flexid}")]
        for i in content.info:
            final_info_tags.append(ContentTag(tag=i))
        with transaction.atomic():
            _content.info.delete()
            _content.info.create_bulk(final_info_tags)

        final_references = []
        for ref in content.references:
            ob = Content.objects.filter(
                flexid=ref.target, component_id=_content.component_id
            ).first()
            if not ob:
                continue
            final_references.append(ContentReference(
                target=ob, group=ref.group or "",
            ))
        with transaction.atomic():
            _content.references.delete()
            _content.references.create_bulk(final_references)

        return cls(content=_content)


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        value = Upload(required=False)

    value = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, content_id, value):
        result = retrieve_allowed_objects(
            info, "push", Content.objects.all()
        )
        source = result["objects"].get(id=content_id)
        actions = \
            result["components"][source.component.flexid]["actions"].filter(
                content_action__content=source
            ).prefetch_selected("content_action")

        extras = {}
        for action in actions:
            extras.update(result["action_extras"].get(action.id, []))
        raise NotImplementedError
