from strawberry.types import Info
from typing import List, Optional
import re

from ...utils.auth import get_cached_net_properties

_valid_permissions = re.compile(r"^(?:manage_|allow_)")


def get_permissions(info: Info) -> List[str]:
    return list(
        filter(
            lambda x: _valid_permissions.match(x),
            get_cached_net_properties(
                info.context["request"], ensureInitialized=True
            ),
        )
    )


def active_user(info: Info) -> Optional[str]:
    user = getattr(info.context["request"], "user", None)
    if user and not user.is_authenticated:
        user = None
    if user:
        user = user.get_username()
    return user
