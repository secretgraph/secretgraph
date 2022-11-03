from strawberry.types import Info
from typing import List
import re

from ...utils.auth import get_cached_permissions

_valid_permissions = re.compile(r"^(?:manage_|register_)")


def get_permissions(info: Info) -> List[str]:
    return list(
        filter(
            lambda x: _valid_permissions.match(x),
            get_cached_permissions(
                info.context.request, ensureInitialized=True
            ),
        )
    )
