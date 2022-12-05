from typing import (
    TypeVar,
    Optional,
    TypedDict,
)

from django.db.models import QuerySet

from ..core.typings import Scope, Action, Hash
from . import models

AuthActionInfoDict = TypeVar(
    "AuthActionInfoDict", dict[str, dict[tuple[Action, Hash], str]]
)


class ResultObject(TypedDict):
    authset: list[str]
    scope: Scope
    rejecting_action: Optional[tuple[models.Action, dict]]
    decrypted: dict
    active_actions: set[str]
    actions: QuerySet
    # {id: {(action, hash): id}}  # noqa
    action_info_clusters: AuthActionInfoDict
    action_info_contents: AuthActionInfoDict
