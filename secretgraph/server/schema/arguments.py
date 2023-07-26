import dataclasses
from datetime import datetime
from typing import Iterable, List, Optional

import strawberry
from strawberry.file_uploads import Upload
from strawberry.scalars import ID, JSON

from ..models import Net
from .shared import DeleteRecursive

AuthList = Optional[List[str]]


@strawberry.input
class ActionInput:
    value: JSON = strawberry.field(
        description='Action definition, "delete" for action deletion'
    )
    # required for special value "delete" or replacing existing tokens
    # note: delete works Cluster wide even if used in connection with a content
    existingHash: Optional[str] = None
    start: Optional[datetime] = None
    stop: Optional[datetime] = None
    # except with deletion always required as actions must be checked and
    # transformed by server
    key: Optional[str] = strawberry.field(
        description="Action key for encrypting action (base64, 32 bytes)",
        default=None,
    )


@strawberry.input
class ReferenceInput:
    target: ID = strawberry.field(
        description="Can be node id, direct id of content or hash of key",
    )
    extra: Optional[str] = None
    group: Optional[str] = None
    deleteRecursive: Optional[DeleteRecursive] = None


@strawberry.input
class ContentKeyInput:
    # there is no privateState as it is always protected
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
    references: Optional[List[ReferenceInput]] = strawberry.field(
        description=(
            "automagically distributed between PublicKey and PrivateKey"
        ),
        default=None,
    )
    nonce: Optional[str] = strawberry.field(
        description="Nonce for private key (base64, 13 bytes)", default=None
    )
    publicState: Optional[str] = None


@strawberry.input
class ContentValueInput:
    value: Optional[Upload] = None
    state: Optional[str] = None
    type: Optional[str] = None
    nonce: Optional[str] = None
    tags: Optional[List[str]] = None
    actions: Optional[List[ActionInput]] = None
    references: Optional[List[ReferenceInput]] = None


@strawberry.input
class ContentInput:
    net: Optional[ID] = None
    cluster: Optional[ID] = None
    hidden: Optional[bool] = None
    # when creating keypair: references are automagically distributed
    key: Optional[ContentKeyInput] = None
    value: Optional[ContentValueInput] = None
    contentHash: Optional[str] = None
    additionalNets: strawberry.Private[Optional[Iterable[Net]]] = None


@strawberry.input
class PushContentValueInput:
    value: Upload
    state: Optional[str] = None
    type: str
    nonce: str
    tags: List[str] = strawberry.field(default_factory=list)
    actions: strawberry.Private[List[ActionInput]] = dataclasses.field(
        default_factory=list
    )


@strawberry.input
class PushContentInput:
    parent: Optional[ID] = None
    value: PushContentValueInput
    net: Optional[ID] = None
    additionalNets: strawberry.Private[Optional[Iterable[Net]]] = None


@strawberry.input
class ClusterInput:
    net: Optional[ID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    featured: Optional[bool] = None
    primary: Optional[bool] = None
    actions: Optional[list[ActionInput]] = None
    keys: Optional[list[ContentKeyInput]] = strawberry.field(
        description="add up to two keys initially;"
        "note: if out of resources even the cluster is reverted",
        default=None,
    )
    clusterGroups: Optional[list[str]] = None
    netGroups: Optional[list[str]] = None
