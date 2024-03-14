import re
from functools import lru_cache
from typing import Optional

from django.conf import settings
from django.utils.translation import get_language, gettext, override
from strawberry.types import Info

from ...utils.auth import aget_cached_net_properties, aget_user
from ._shared import Language

_valid_permissions = re.compile(r"^(?:manage_|allow_|bypass_)")


async def get_permissions(info: Info) -> list[str]:
    return list(
        filter(
            lambda x: _valid_permissions.match(x),
            await aget_cached_net_properties(
                info.context["request"], ensureInitialized=False
            ),
        )
    )


async def get_active_user(info: Info) -> Optional[str]:
    user = await aget_user(info.context["request"])
    if user:
        user = user.get_username()
    return user


@lru_cache(1)
def get_languages() -> list[Language]:
    ret = []
    for language in settings.LANGUAGES:
        with override(language[0]):
            ret.append(Language(code=language[0], name=gettext(language[1])))
    return ret


def get_active_language() -> Optional[Language]:
    code = get_language()
    if not code:
        return None
    # full match
    for language in get_languages():
        if language.code == code:
            return language
    # partial match or match main language
    code = code.split("-")[0]
    for language in get_languages():
        if language.code.startswith(code):
            return language
    return None
