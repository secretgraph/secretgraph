from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Union

from django.core.files.base import File

from ....core.constants import DeleteRecursive
from ...models import Cluster, Content, ContentReference, Net

AuthList = Optional[List[str]]


@dataclass
class ActionInput:
    value: Union[str, dict]
    # except with deletion always required as actions must be checked and
    # transformed by server
    existingHash: Optional[str] = None
    start: Optional[datetime] = None
    stop: Optional[datetime] = None
    key: Optional[str] = None


@dataclass
class ReferenceInput:
    target: Union[str, int, ContentReference, Content]
    extra: Optional[str] = None
    group: Optional[str] = None
    deleteRecursive: Optional[DeleteRecursive] = None


@dataclass
class ActionInputStrict(ActionInput):
    value: dict


@dataclass
class ContentKeyInput:
    publicKey: Optional[Union[str, bytes, File]] = None
    # encrypted!
    privateKey: Optional[Union[str, bytes, File]] = None
    privateTags: Optional[List[str]] = None
    publicTags: Optional[List[str]] = None
    privateActions: Optional[List[ActionInput]] = None
    publicActions: Optional[List[ActionInput]] = None
    cryptoParameters: Optional[str] = None
    references: Optional[List[ReferenceInput]] = None
    publicState: Optional[str] = None


@dataclass
class ContentKeyInputStrict:
    publicKey: Optional[bytes] = None
    privateKey: Optional[bytes] = None
    cryptoParameters: Optional[str] = None


@dataclass
class ContentValueInput:
    value: Optional[Union[str, bytes, File]] = None
    state: Optional[str] = None
    type: Optional[str] = None
    cryptoParameters: Optional[str] = None
    tags: Optional[List[str]] = None
    references: Optional[List[ReferenceInput]] = None
    actions: Optional[List[ActionInput]] = None


@dataclass
class ContentInput:
    net: Optional[str] = None
    cluster: Optional[str | Cluster] = None
    hidden: Optional[bool] = None
    # when creating keypair: references are automagically distributed
    key: Optional[ContentKeyInput] = None
    value: Optional[ContentValueInput] = None
    contentHash: Optional[str] = None
    additionalNets: Optional[Union[list[Net], tuple[Net]]] = None


@dataclass
class ContentMergedInput:
    net: Optional[Union[str, int, Net]] = None
    cluster: Optional[Union[str, Cluster]] = None
    references: Optional[List[ReferenceInput]] = None
    contentHash: Optional[str] = None
    hidden: Optional[bool] = None
    value: Optional[File] = None
    state: Optional[str] = None
    type: Optional[str] = None
    cryptoParameters: Optional[str] = None
    tags: Optional[List[str]] = None
    actions: Optional[List[ActionInput]] = None
    additionalNets: Optional[Union[list[Net], tuple[Net]]] = None


@dataclass
class ClusterInput:
    net: Optional[Union[str, Net]] = None
    name: Optional[str] = None
    description: Optional[str] = None
    featured: Optional[bool] = None
    primary: Optional[bool] = None
    actions: Optional[list[ActionInput]] = None
    # has no references so missing reference tag is no problem
    keys: Optional[list[ContentKeyInput]] = None
    clusterGroups: Optional[list[str]] = None
    netGroups: Optional[list[str]] = None
