from typing import (
    TypeVar,
    Optional,
    TypedDict,
)

from django.db.models import QuerySet

from ..core.typings import Scope, Action, Hash

AuthActionInfoDict = TypeVar(
    "AuthActionInfoDict", dict[str, dict[tuple[Action, Hash], str]]
)


class ResultObject(TypedDict):
    authset: list[str]
    scope: Scope
    rejecting_action: Optional[str]
    decrypted: dict
    active_actions: set[str]
    actions: QuerySet
    action_key_map: dict
    # {id: {(action, hash): id}}  # noqa
    action_info_clusters: AuthActionInfoDict
    action_info_contents: AuthActionInfoDict
