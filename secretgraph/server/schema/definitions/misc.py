import re
from typing import Optional

from strawberry.types import Info
from strawberry_django import django_resolver

from ...utils.auth import get_cached_net_properties

_valid_permissions = re.compile(r"^(?:manage_|allow_)")


@django_resolver
def get_permissions(info: Info) -> list[str]:
    return list(
        filter(
            lambda x: _valid_permissions.match(x),
            get_cached_net_properties(
                info.context["request"], ensureInitialized=True
            ),
        )
    )


@django_resolver
def active_user(info: Info) -> Optional[str]:
    user = getattr(info.context["request"], "user", None)
    if user and not user.is_authenticated:
        user = None
    if user:
        user = user.get_username()
    return user
