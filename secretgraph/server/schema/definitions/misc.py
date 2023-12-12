import re
from functools import lru_cache
from typing import Optional

from django.conf import settings
from django.utils.translation import get_language, gettext
from strawberry.types import Info
from strawberry_django import django_resolver

from ...utils.auth import get_cached_net_properties
from ._shared import Language

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
def get_active_user(info: Info) -> Optional[str]:
    user = getattr(info.context["request"], "user", None)
    if user and not user.is_authenticated:
        user = None
    if user:
        user = user.get_username()
    return user


def get_active_language() -> Optional[Language]:
    code = get_language()
    if not code:
        return None
    # full match
    for lcode, translation in settings.LANGUAGES:
        if lcode == code:
            return Language(code=lcode, name=gettext(translation))
    # partial match
    code = code.split("-")[0]
    for lcode, translation in settings.LANGUAGES:
        if lcode.startswith(code):
            return Language(code=lcode, name=gettext(translation))
    return None


@lru_cache(1)
def get_languages() -> list[Language]:
    return [
        Language(code=language[0], name=gettext(language[1]))
        for language in settings.LANGUAGES
    ]
