from datetime import timedelta as td

from django.db.models import Q, QuerySet
from django.utils import timezone

from graphql_relay import from_global_id

from ..models import Component, Content, ContentAction
from ..utils.auth import retrieve_allowed_objects


def fetch_components(
    request, query=None,
    info_include=None, info_exclude=None
):
    if query is None:
        query = Component.objects.all()
    elif isinstance(query, str):
        if ":" in query:
            type_name, query = from_global_id(query)
        query = Component.objects.filter(flexid=query)
    incl_filters = Q()
    for i in info_include or []:
        incl_filters |= Q(contents__info__tag__startswith=i)

    excl_filters = Q()
    for i in info_exclude or []:
        excl_filters |= Q(contents__info__tag__startswith=i)
    result = retrieve_allowed_objects(
        request, "view", query.filter(~excl_filters & incl_filters)
    )
    return result["objects"]


class UsageTracker(object):

    def __init__(self, result, objects=None):
        self._qs = objects or result["objects"]
        self._result = result

    def _fetch_trigger(self, objects):
        if isinstance(objects, (QuerySet, list, set, tuple)):
            used_actions = self._result["actions"].filter(
                content_action__content__in=objects
            ).select_related("content_action")
        else:
            used_actions = self._result["actions"].filter(
                content_action__content=objects
            ).select_related("content_action")
        cactions = ContentAction.objects.filter(action__in=used_actions)
        cactions.update(used=True)
        mark_for_destruction = timezone.now() + td(hours=8)
        contents = Content.objects.filter(
            actions__in=cactions.filter(group="fetch", used=True)
        ).exclude(actions__in=ContentAction.objects.filter(
            group="fetch", used=False
        ))
        contents.update(mark_for_destruction=mark_for_destruction)
        return objects

    def __iter__(self):
        for i in super().__iter__():
            yield self._fetch_trigger(i)

    def __len__(self):
        return self._qs.__len__()

    def __getattr__(self, key):
        return getattr(self._qs, key)

    def __getitem__(self, key):
        return self._fetch_trigger(self._qs.__getitem__(key))


def fetch_contents(
    request, query=None,
    info_include=None, info_exclude=None
) -> UsageTracker:
    if query is None:
        query = Component.objects.all()
    elif isinstance(query, str):
        if ":" in query:
            type_name, query = from_global_id(query)
        query = Component.objects.filter(flexid=query)
    incl_filters = Q()
    for i in info_include or []:
        incl_filters |= Q(info__tag__startswith=i)

    excl_filters = Q()
    for i in info_exclude or []:
        excl_filters |= Q(info__tag__startswith=i)
    result = retrieve_allowed_objects(
        request, "view", query.filter(~excl_filters & incl_filters)
    )
    return UsageTracker(result)
