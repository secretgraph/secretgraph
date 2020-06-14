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
    publicKey = Upload(
        required=False,
        description="Cleartext public key in der format"
    )
    # encrypted!
    privateKey = Upload(
        required=False,
        description=(
            "Encrypted private key (requires nonce)"
        )
    )
    nonce = graphene.String(
        required=False,
        description="Nonce for private key (base64, 13 bytes)"
    )
    privateInfo = graphene.List(
        graphene.String, required=False,
        description="Info tags for private key"
    )

    publicInfo = graphene.List(
        graphene.String, required=False,
        description="Info tags for public key"
    )


class ReferenceInput(graphene.InputObjectType):
    target = graphene.ID(
        required=True,
        description="Can be id, flexid of content or hash of key"

    )
    extra = graphene.String(required=False)
    group = graphene.String(required=False)


class ContentValueInput(graphene.InputObjectType):
    value = Upload(required=True)
    nonce = graphene.String(required=False)
    info = graphene.List(graphene.String, required=False)


class ContentInput(graphene.InputObjectType):
    cluster = graphene.ID(required=False)
    key = ContentKeyInput(required=False)
    value = ContentValueInput(required=False)
    references = graphene.List(ReferenceInput, required=False)
    contentHash = graphene.String(required=False)
    actions = graphene.List(ActionInput, required=False)


class PushContentInput(graphene.InputObjectType):
    parent = graphene.ID(required=True)
    value = ContentValueInput(required=True)
    references = graphene.List(ReferenceInput, required=False)


class ClusterInput(graphene.InputObjectType):
    publicInfo = graphene.String(required=False)
    actions = graphene.List(ActionInput, required=False)
    key = ContentKeyInput(required=False)
