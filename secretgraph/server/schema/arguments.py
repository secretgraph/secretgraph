from typing import Iterable, Optional, List
from strawberry.file_uploads import Upload
from datetime import datetime
import strawberry
from strawberry.scalars import JSON, ID

from .shared import DeleteRecursive
from ..models import GlobalGroup, Net


AuthList = Optional[List[str]]


@strawberry.input
class ActionInput:
    value: JSON = strawberry.field(
        description='Action definition, "delete" for action deletion'
    )
    # except with deletion always required as actions must be checked and
    # transformed by server
    existingHash: Optional[str] = None
    start: Optional[datetime] = None
    stop: Optional[datetime] = None
    key: Optional[str] = strawberry.field(
        description="Action key for encrypting action (base64, 32 bytes)",
        default=None,
    )


@strawberry.input
class ContentKeyInput:
    publicKey: Optional[Upload] = strawberry.field(
        description="Cleartext public key in der format", default=None
    )
    # encrypted!
    privateKey: Optional[Upload] = strawberry.field(
        description=("Encrypted private key (requires nonce)"), default=None
    )
    privateTags: Optional[List[str]] = strawberry.field(
        description="Metadata tags for private key", default=None
    )

    publicTags: Optional[List[str]] = strawberry.field(
        description="Metadata tags for public key", default=None
    )
    privateActions: Optional[List[ActionInput]] = None
    publicActions: Optional[List[ActionInput]] = None
    nonce: Optional[str] = strawberry.field(
        description="Nonce for private key (base64, 13 bytes)", default=None
    )
    publicState: Optional[str] = None


@strawberry.input
class ReferenceInput:
    target: ID = strawberry.field(
        description="Can be node id, direct id of content or hash of key",
    )
    extra: Optional[str] = None
    group: Optional[str] = None
    deleteRecursive: Optional[DeleteRecursive] = None


@strawberry.input
class ContentValueInput:
    value: Optional[Upload] = None
    state: Optional[str] = None
    type: Optional[str] = None
    nonce: Optional[str] = None
    tags: Optional[List[str]] = None
    actions: Optional[List[ActionInput]] = None


@strawberry.input
class ContentInput:
    net: Optional[ID] = None
    cluster: Optional[ID] = None
    # when creating keypair: references are automagically distributed
    key: Optional[ContentKeyInput] = None
    value: Optional[ContentValueInput] = None
    references: Optional[List[ReferenceInput]] = None
    contentHash: Optional[str] = None
    additionalNets: strawberry.Private[Optional[Iterable[Net]]] = None


@strawberry.input
class PushContentInput:
    parent: ID
    value: ContentValueInput
    net: Optional[ID] = None


@strawberry.input
class ClusterInput:
    net: Optional[ID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    public: Optional[bool] = None
    featured: Optional[bool] = None
    actions: Optional[List[ActionInput]] = None
    # has no references so missing reference tag is no problem
    key: Optional[ContentKeyInput] = None
    groups: strawberry.Private[Optional[Iterable[GlobalGroup]]] = None
