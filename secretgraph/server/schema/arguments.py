import graphene
from graphene_file_upload.scalars import Upload


class ActionInputBase(graphene.InputObjectType):
    action = graphene.String(required=True)


class ActionInputView(ActionInputBase):
    pass


class ActionInputManage(ActionInputBase):
    exclude = graphene.List(graphene.ID, required=False)


class ActionInputValue(graphene.Union):
    class Meta:
        types = (ActionInputView, ActionInputManage,)


class ActionInput(graphene.InputObjectType):
    start = graphene.DateTime(required=False)
    stop = graphene.DateTime(required=False)
    value = graphene.ActionInputValue(required=True)
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
