import graphene
from graphene_file_upload.scalars import Upload


class ActionInput(graphene.InputObjectType):
    start = graphene.DateTime(required=False)
    stop = graphene.DateTime(required=False)
    value = graphene.JSONString(
        required=True,
        description="Action definition"
    )
    # always required as actions must be checked and transformed by server
    key = graphene.String(
        required=True,
        description="Action key for encrypting action (base64, 32 bytes)"
    )


class ContentKeyInput(graphene.InputObjectType):
    publicKey = graphene.String(
        required=True,
        description="Cleartext public key (base64 encoded DER key)"
    )
    # encrypted!
    privateKey = graphene.String(
        required=False,
        description=(
            "Encrypted private key (base64 encoded DER key, "
            "requires nonce)"
        )
    )
    nonce = graphene.String(
        required=False,
        description="Nonce for private key (base64, 13 bytes)"
    )
    info = graphene.List(
        graphene.String, required=False,
        description="Info for private key"
    )


class ReferenceInput(graphene.InputObjectType):
    target = graphene.ID(required=True)
    extra = graphene.String(required=False)
    group = graphene.String(required=False)


class ContentValueInput(graphene.InputObjectType):
    value = Upload(required=True)
    nonce = graphene.String(required=False)


class ContentInput(graphene.InputObjectType):
    cluster = graphene.ID(required=False)
    key = ContentKeyInput(required=False)
    value = ContentValueInput(required=False)
    references = graphene.List(ReferenceInput, required=False)
    info = graphene.List(graphene.String, required=False)
    contentHash = graphene.String(required=False)
    actions = graphene.List(ActionInput, required=False)


class PushContentInput(graphene.InputObjectType):
    parent = graphene.ID(required=True)
    value = ContentValueInput(required=True)
    references = graphene.List(ReferenceInput, required=False)
    info = graphene.List(graphene.String, required=False)


class ClusterInput(graphene.InputObjectType):
    publicInfo = graphene.String(required=False)
    actions = graphene.List(ActionInput, required=False)
    key = ContentKeyInput(required=False)
