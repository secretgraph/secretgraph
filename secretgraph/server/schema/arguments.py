from typing import Optional, List
from strawberry.file_uploads import Upload
from datetime import datetime
import strawberry
from strawberry.scalars import JSON, ID

from .shared import DeleteRecursive


AuthList = Optional[List[str]]


@strawberry.input
class ActionInput:
    existingHash: Optional[str]
    start: Optional[datetime]
    stop: Optional[datetime]
    value: JSON = strawberry.field(
        description='Action definition, "delete" for action deletion'
    )
    # except with deletion always required as actions must be checked and
    # transformed by server
    key: Optional[str] = strawberry.field(
        description="Action key for encrypting action (base64, 32 bytes)"
    )


@strawberry.input
class ContentKeyInput:
    publicKey: Optional[Upload] = strawberry.field(
        description="Cleartext public key in der format"
    )
    # encrypted!
    privateKey: Optional[Upload] = strawberry.field(
        description=("Encrypted private key (requires nonce)")
    )
    privateTags: Optional[List[str]] = strawberry.field(
        description="Metadata tags for private key",
    )

    publicTags: Optional[List[str]] = strawberry.field(
        description="Metadata tags for public key",
    )
    privateActions: Optional[List[str]]
    publicActions: Optional[List[str]]
    nonce: Optional[str] = strawberry.field(
        description="Nonce for private key (base64, 13 bytes)"
    )
    publicState: Optional[str]


@strawberry.input
class ReferenceInput:
    target: ID = strawberry.field(
        description="Can be node id, direct id of content or hash of key",
    )
    extra: Optional[str]
    group: Optional[str]
    deleteRecursive: Optional[DeleteRecursive]


@strawberry.input
class ContentValueInput:
    value: Optional[Upload]
    state: Optional[str]
    type: Optional[str]
    nonce: Optional[str]
    tags: Optional[List[str]]
    actions: Optional[List[ActionInput]]


@strawberry.input
class ContentInput:
    cluster: Optional[ID]
    # when creating keypair: references are automagically distributed
    key: Optional[ContentKeyInput]
    value: Optional[ContentValueInput]
    references: Optional[List[ReferenceInput]]
    contentHash: Optional[str]


@strawberry.input
class PushContentInput:
    parent: ID
    value: ContentValueInput


@strawberry.input
class ClusterInput:
    name: Optional[str]
    description: Optional[str]
    public: Optional[bool]
    featured: Optional[bool]
    actions: Optional[List[ActionInput]]
    # has no references so missing reference tag is no problem
    key: Optional[ContentKeyInput]
