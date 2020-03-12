import graphene
from django.conf import settings
from django.core.files.base import ContentFile
from graphene import relay
from rdflib import Graph

from ..models import Component, Content, ContentValue
# , ReferenceContent
from ..signals import generateFlexid
from ..utils import check_name, parse_name_q, retrieve_allowed_objects
from .definitions import (
    ComponentNode, ContentNode, ContentValueNode, FlexidType, InsertMode
)
from ...constants import sgraph_component


class ComponentMutation(relay.ClientIDMutation):
    class Input:
        component = graphene.Field(ComponentNode)

    component = graphene.Field(ComponentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, component):
        idpart = cls.from_global_id(component.id)[1]
        g = Graph()
        g.parse(component.public_info, "turtle")
        if idpart:
            _component = retrieve_allowed_objects(
                component.info, "manage", Component.objects.all()
            ).get(flexid=idpart)
            _component.public_info = component.public_info
            if component.nonce:
                _component.nonce = component.nonce
            # TODO: admin permission
            # if info.context.user.has_perm("TODO") and user:
            #     prebuild["user"] = cls.from_global_id(user)[1]
            component.save(update_fields=["public_info", "nonce"])
        else:
            prebuild = {
                "public_info": component.public_info,
            }
            if component.nonce:
                prebuild["nonce"] = component.nonce
            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if not info.context.user.is_authenticated:
                    raise
                prebuild["user"] = info.context.user
            # TODO: admin permission
            # if info.context.user.has_perm("TODO") and user:
            #     prebuild["user"] = cls.from_global_id(user)[1]
            _component = Component.objects.create(**prebuild)
        # TODO: initial: create actions, contents
        _component.public = False
        if list(g.query(
            """
            SELECT DISITINCT (COUNT(?tasks) AS ?ctasks)
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
            if i.ctasks == 0:
                _component.public = True
        _component.save(update_fields=["public"])

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
        elif _type == "ContentValue":
            objects = ContentValue.objects.all()
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
        content = graphene.Field(ContentNode, required=True)
        mode = graphene.Field(InsertMode, default_value=InsertMode.ADD)

    content = graphene.Field(ContentNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id, content, mode):
        if id:
            result = retrieve_allowed_objects(
                info, "update", Content.objects.all()
            )
            _content = result["objects"].get(flexid=cls.from_global_id(id)[1])
        else:
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

        if content.nonce and _content.component.nonce != content.nonce:
            raise ValueError("new nonce must match component nonce")

        files = info.context.FILES
        flexid_name_map = {}
        val_name_dict = parse_name_q(result["excl_values"], negated=True)

        # TODO: handle references
        value_names = set()
        for v in content.values:
            if not check_name(val_name_dict, v.name):
                continue
            value_names.add(v.name)
            if v.flexid:
                flexid_name_map[v.flexid] = v.name
            if len(v.value) < 255 and v.value in files:
                setattr(v, "file", files[v.value])
            else:
                setattr(v, "file", ContentFile(v.value))

        if _content.id:
            # update contents if nonce changes
            if content.nonce and content.nonce != _content.nonce:
                if result["excl_values"].children:
                    raise ValueError("Missing update rights")
                if flexid_name_map and mode == InsertMode.ADD:
                    _content.values.exclude(
                        flexid__in=list(flexid_name_map.keys())
                    ).delete()
                    objs = []
                    for count, v in enumerate(
                        _content.values.only("id", "flexid")
                    ):
                        v.name = flexid_name_map[v.flexid]
                        objs.append(v)
                        if count > 0 and count % 10 == 0:
                            _content.values.bulk_update(objs)
                            objs = []
                    if objs:
                        _content.values.bulk_update(objs)
                else:
                    _content.values.all().delete()
            elif mode == InsertMode.REPLACE_PARTLY:
                _content.values.filter(name__in=value_names).exclude(
                    flexid__in=list(flexid_name_map.keys())
                ).delete()
            elif mode == InsertMode.REPLACE:
                _content.values.exclude(
                    flexid__in=list(flexid_name_map.keys())
                ).delete()
        if content.nonce:
            _content.nonce = content.nonce
        _content.save()

        for v in content.values:
            if v.name not in value_names:
                continue
            _d = {
                "name": v.name,
                "search_value": v.search_value,
                "file": v.file
            }
            if id and v.id:
                _content.values.update_or_create(
                    defaults=_d, flexid=v.id
                )
            else:
                _content.values.create(
                    **_d
                )
        content.values = content.values.exclude(result["excl_values"])
        return cls(content=content)


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        name = graphene.String(required=True)
        value = graphene.String(required=False)

    value = graphene.Field(ContentValueNode)

    @classmethod
    def mutate_and_get_payload(cls, root, info, id, name, value):
        result = retrieve_allowed_objects(
            info, "push", Content.objects.all()
        )
        name_allowance_dict = parse_name_q(result["excl_names"], negated=True)
        if not check_name(name_allowance_dict, name):
            raise ValueError("Not allowed")
        _content = result["objects"].get(
            flexid=cls.from_global_id(id)[1]
        )
        files = info.context.FILES

        if len(value) < 255 and value in files:
            f = files[value]
        else:
            f = ContentFile(value)

        cv = _content.values.create(
            name=name, file=f
        )
        return cls(value=cv)
