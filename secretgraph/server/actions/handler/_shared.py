from functools import lru_cache

from django.db.models import Q


def only_owned_helper(
    klass,
    linput,
    request,
    fields=("id",),
    check_fields=None,
    scope="manage",
    authset=None,
    only_first_field=False,
):
    from ...utils.auth import retrieve_allowed_objects

    if not check_fields:
        check_fields = ["flexid", "id"]
    q = Q()
    for field in check_fields:
        if hasattr(klass, field):
            q |= Q(**{f"{field}__in": linput or []})
    fields = filter(lambda x: hasattr(klass, x))
    if only_first_field:
        fields = list(fields)[:1]
    return retrieve_allowed_objects(
        request,
        klass.objects.filter(q),
        scope,
        authset=authset,
    )["objects"].values_list(*fields, flat=True)


@lru_cache()
def get_valid_fields(klass):
    if isinstance(klass, str):
        from django.apps import apps

        klass = apps.get_model("secretgraph", klass)
    return {
        name: klass.__annotations__[name]
        for name in set(map(lambda x: x.name, klass._meta.get_fields()))
        .difference(
            ("id", "cluster", "cluster_id", "references", "referencedBy")
        )
        .union(klass.__annotations__.keys())
    }
