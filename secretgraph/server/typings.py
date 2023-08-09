from typing import Optional, TypedDict, TypeVar

from django.db.models import QuerySet

from ..core.typings import Action, Hash, Scope
from . import models

AuthActionInfoDict = TypeVar(
    "AuthActionInfoDict", dict[str, dict[tuple[Action, Hash], list[str]]]
)


class AllowedObjectsResult(TypedDict):
    authset: list[str]
    scope: Scope
    rejecting_action: Optional[tuple[models.Action, dict]]
    action_results: dict
    active_actions: set[str]
    actions: QuerySet
    # {id: {(action, hash): id}}  # noqa
    action_info_clusters: AuthActionInfoDict
    action_info_contents: AuthActionInfoDict
