from strawberry.types import Info
from typing import List
import re

from ...utils.auth import get_cached_properties

_valid_permissions = re.compile(r"^(?:manage_|allow_)")


def get_permissions(info: Info) -> List[str]:
    return list(
        filter(
            lambda x: _valid_permissions.match(x),
            get_cached_properties(
                info.context["request"], ensureInitialized=True
            ),
        )
    )
