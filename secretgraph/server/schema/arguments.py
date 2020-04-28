import graphene
from graphene_file_upload.scalars import Upload


class ActionInput(graphene.InputObjectType):
    start = graphene.DateTime(required=False)
    stop = graphene.DateTime(required=False)
    value = graphene.JSONString(required=True)
    # always required as actions must be checked and transformed by server
    key = graphene.String(required=True)


class ActionListInput(graphene.InputObjectType):
    actions = graphene.List(ActionInput, required=True)
    content = graphene.ID(required=False)


class ContentKeyInput(graphene.InputObjectType):
    # small version of ContentInput for key. Can autocompute most things
    value = Upload(required=True)
    nonce = graphene.String(required=True)


class ReferenceInput(graphene.InputObjectType):
    target = graphene.ID(required=False)
    group = graphene.String(required=False)


class ContentValueInput(graphene.InputObjectType):
    value = Upload(required=True)
    nonce = graphene.String(required=False)
    references = graphene.List(ReferenceInput, required=False)
    info = graphene.List(graphene.String)
    info_for_hash = graphene.List(graphene.String)


class ContentInput(graphene.InputObjectType):
    component = graphene.ID(required=False)
    key = ContentKeyInput(required=False)
    value = ContentValueInput(required=False)


class ComponentInput(graphene.InputObjectType):
    public_info = graphene.String(required=False)
    actions = graphene.List(ActionListInput, required=False)
    key = ContentKeyInput(required=False)
