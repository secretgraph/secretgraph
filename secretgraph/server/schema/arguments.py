import graphene
from graphene_file_upload.scalars import Upload


class ActionInput(graphene.InputObjectType):
    start = graphene.DateTime(required=False)
    stop = graphene.DateTime(required=False)
    value = graphene.JSONString(required=True)
    # always required as actions must be checked and transformed by server
    key = graphene.String(required=True)


class ComponentInput(graphene.InputObjectType):
    public_info = graphene.String(required=False)
    actions = graphene.List(ActionInput, required=False)


class ReferenceInput(graphene.InputObjectType):
    target = graphene.ID(required=False)
    group = graphene.String(required=False)


class ContentInput(graphene.InputObjectType):
    id = graphene.ID(required=False)
    value = Upload(required=False)
    nonce = graphene.String(required=False)
    component = graphene.String(required=False)
    references = graphene.List(ReferenceInput, required=False)
    info = graphene.List(graphene.String)
    info_for_hash = graphene.List(graphene.String)
