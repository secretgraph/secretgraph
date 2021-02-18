import graphene
from graphene_file_upload.scalars import Upload

from ... import constants


class AuthList(graphene.List):
    def __init__(
        self,
        of_type=graphene.NonNull(graphene.String),
        *args,
        required=False,
        **kwargs,
    ):
        super().__init__(of_type, *args, required=required, **kwargs)


class ActionInput(graphene.InputObjectType):
    idOrHash = graphene.String(required=False)
    start = graphene.DateTime(required=False)
    stop = graphene.DateTime(required=False)
    value = graphene.JSONString(required=True, description="Action definition")
    # always required as actions must be checked and transformed by server
    key = graphene.String(
        required=False,
        description="Action key for encrypting action (base64, 32 bytes)",
    )


class ContentKeyInput(graphene.InputObjectType):
    publicKey = Upload(
        required=False, description="Cleartext public key in der format"
    )
    # encrypted!
    privateKey = Upload(
        required=False, description=("Encrypted private key (requires nonce)")
    )
    nonce = graphene.String(
        required=False, description="Nonce for private key (base64, 13 bytes)"
    )
    privateTags = graphene.List(
        graphene.NonNull(graphene.String),
        required=True,
        description="Metadata tags for private key",
    )

    publicTags = graphene.List(
        graphene.NonNull(graphene.String),
        required=True,
        description="Metadata tags for public key",
    )


def ReferenceInput_desc(v):
    if v == constants.DeleteRecursive.FALSE:
        return "Keep content when referenced content is deleted"
    elif v == constants.DeleteRecursive.TRUE:
        return "Delete content when referenced content is deleted (default)"
    elif v == constants.DeleteRecursive.NO_GROUP:
        return "Delete content when referenced content is deleted and no other reference with the same group is remaining"  # noqa: E501
    elif v is None:
        return "Specify policy for recursive deletions"
    else:
        raise Exception(f"Invalid type: {v}")


deleteRecursiveEnum = graphene.Enum.from_enum(
    constants.DeleteRecursive, description=ReferenceInput_desc
)


class ReferenceInput(graphene.InputObjectType):
    target = graphene.ID(
        required=True,
        description="Can be node id, direct id of content or hash of key",
    )
    extra = graphene.String(required=False)
    group = graphene.String(required=False)
    deleteRecursive = deleteRecursiveEnum(required=False)


class ContentValueInput(graphene.InputObjectType):
    value = Upload(required=False)
    nonce = graphene.String(required=False)
    tags = graphene.List(graphene.NonNull(graphene.String), required=False)


class ContentInput(graphene.InputObjectType):
    cluster = graphene.ID(required=False)
    key = ContentKeyInput(required=False)
    value = ContentValueInput(required=False)
    references = graphene.List(
        graphene.NonNull(ReferenceInput), required=False
    )
    contentHash = graphene.String(required=False)
    actions = graphene.List(ActionInput, required=False)


class PushContentInput(graphene.InputObjectType):
    parent = graphene.ID(required=True)
    value = ContentValueInput(required=True)
    references = graphene.List(
        graphene.NonNull(ReferenceInput), required=False
    )


class ClusterInput(graphene.InputObjectType):
    publicInfo = Upload(required=False)
    actions = graphene.List(graphene.NonNull(ActionInput), required=False)
    key = ContentKeyInput(required=False)
