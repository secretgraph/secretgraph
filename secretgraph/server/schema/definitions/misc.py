from strawberry.types import Info

from ...utils.auth import get_cached_permissions


def get_permissions(info: Info) -> list[str]:
    return list(
        filter(
            lambda x: x.startswith("manage_") or x == "register_global_name",
            get_cached_permissions(
                info.context.request, ensureInitialized=True
            ),
        )
    )