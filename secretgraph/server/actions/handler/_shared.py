from functools import lru_cache


def only_owned_helper(
    klass,
    linput,
    request,
    fields=("id",),
    check_field=None,
    scope="manage",
    authset=None,
):
    from ...utils.auth import retrieve_allowed_objects

    if not check_field:
        check_field = "flexid"
    if check_field == "flexid" and not hasattr(klass, "flexid"):
        check_field = "id"
    if not hasattr(klass, "flexid"):
        fields = set(fields).difference({"flexid"})
    return retrieve_allowed_objects(
        request,
        klass.objects.filter(**{f"{check_field}__in": linput or []}),
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
