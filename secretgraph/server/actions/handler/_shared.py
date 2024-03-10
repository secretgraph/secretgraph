from functools import lru_cache

from asgiref.sync import sync_to_async
from django.db.models import Q


async def only_owned_helper(
    klass,
    linput,
    request,
    fields=("id",),
    check_fields=None,
    scope="manage",
    only_first_field=False,
    admin=False,
):
    from ...utils.auth import get_cached_result, retrieve_allowed_objects

    if not check_fields:
        check_fields = ["flexid", "flexid_cached", "id"]
    q = Q()
    for field in check_fields:
        if hasattr(klass, field):
            q |= Q(**{f"{field}__in": linput or []})
    fields = filter(lambda x: hasattr(klass, x), fields)
    if only_first_field:
        fields = list(fields)[:1]
    if admin:
        return [
            val async for val in klass.objects.filter(q).values_list(*fields, flat=True)
        ]

    if scope == "manage":
        return [
            val
            async for val in (
                await get_cached_result(
                    request,
                    scope="manage",
                    cacheName="secretgraphCleanResult",
                    ensureInitialized=True,
                ).aat(klass)
            )["objects_without_public"]
            .filter(q)
            .values_list(*fields, flat=True)
        ]
    elif scope == "link":
        return [
            val
            async for val in (
                await get_cached_result(
                    request,
                    scope="link",
                    cacheName="secretgraphLinkResult",
                    authset=request.secretgraphResult.authset,
                ).aat(klass)
            )["objects_with_public"]
            .filter(q)
            .values_list(*fields, flat=True)
        ]
    elif scope == "view":
        return [
            val
            async for val in (
                await get_cached_result(
                    request,
                    scope="view",
                    authset=request.secretgraphResult.authset,
                ).aat(klass)
            )["objects_with_public"]
            .filter(q)
            .values_list(*fields, flat=True)
        ]
    else:
        return [
            val
            async for val in (
                await retrieve_allowed_objects(
                    request,
                    klass.objects.filter(q),
                    scope,
                    authset=request.secretgraphCleanResult.authset,
                )
            )["objects_without_public"].values_list(*fields, flat=True)
        ]


@sync_to_async
@lru_cache(maxsize=4)
def get_forbidden_content_ids(request):
    from ...utils.auth import get_cached_result

    # now add exclude infos of authset
    s = set()
    result = get_cached_result(
        request,
        scope="manage",
        cacheName="secretgraphCleanResult",
        ensureInitialized=True,
    )["Action"]
    # note: manage always resolves, so using Action is possible
    # it also has the advantage of honoring admin

    for action in result["action_results"].values():
        if action["value"]["action"] in {"manage", "admin"}:
            s.update(action["exclude"].get("Content", []))
    return frozenset(s)
