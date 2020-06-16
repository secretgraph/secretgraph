import logging
from datetime import timedelta as td

from django.db.models import Q, QuerySet
from django.utils import timezone

from ...utils.auth import fetch_by_flexid
from ..models import Content, ContentAction

logger = logging.getLogger(__name__)


def fetch_clusters(
    query, id=None, info_include=None, info_exclude=None
) -> QuerySet:
    if id:
        query = fetch_by_flexid(query, id)
    incl_filters = Q()
    for i in info_include or []:
        incl_filters |= Q(contents__info__tag__startswith=i)

    excl_filters = Q()
    for i in info_exclude or []:
        excl_filters |= Q(contents__info__tag__startswith=i)
    return query.filter(~excl_filters & incl_filters)


class ContentFetchQueryset(QuerySet):
    """
        Tracks usage of contents and mark accordingly Content for removal
    """
    only_direct_fetch_trigger = False

    def __init__(
        self,
        query=None,
        actions=None,
        only_direct_fetch_action_trigger=False,
        **kwargs
    ):
        actions = actions or query.actions
        if actions:
            self.actions = actions
            kwargs["model"] = kwargs.get("model", None) or query.model
        self.only_direct_fetch_action_trigger = \
            only_direct_fetch_action_trigger
        super().__init__(query=query, **kwargs)

    def _clone(self):
        """
        Return a copy of the current QuerySet. A lightweight alternative
        to deepcopy().
        """
        c = super()._clone()
        c.actions = self.actions
        c.only_direct_fetch_action_trigger = \
            self.only_direct_fetch_action_trigger
        return c

    def fetch_action_trigger(self, objects, direct=True):
        """
            Trigger fetch handling stuff
            fetch=delete after read
        """
        assert self.secretgraph_result
        if self.only_direct_fetch_action_trigger and not direct:
            return objects
        if isinstance(objects, Content):
            used_actions = self.actions.filter(
                contentAction__content=objects
            ).select_related("contentAction")
        else:
            used_actions = self.actions.filter(
                contentAction__content__in=objects
            ).select_related("contentAction")
        cactions = ContentAction.objects.filter(action__in=used_actions)
        cactions.update(used=True)
        markForDestruction = timezone.now() + td(hours=8)
        contents = Content.objects.filter(
            actions__in=cactions.filter(group="fetch", used=True)
        ).exclude(actions__in=ContentAction.objects.filter(
            group="fetch", used=False
        ))
        contents.update(markForDestruction=markForDestruction)
        return objects

    def __iter__(self):
        for i in self.fetch_action_trigger(super().__iter__(), False):
            yield i

    def __len__(self):
        return self._originalqs.__len__()

    def __getitem__(self, key):
        return self.fetch_action_trigger(
            self._originalqs.__getitem__(key), False
        )

    def __getattr__(self, key):
        return getattr(self._originalqs, key)

    def get(self, *args, **kwargs):
        return self.fetch_action_trigger(
            self._originalqs.get(*args, **kwargs), False
        )

    def first(self):
        return self.fetch_action_trigger(self._originalqs.first(), False)


def fetch_contents(
    query, actions, id=None, info_include=None, info_exclude=None
) -> QuerySet:
    if id:
        query = fetch_by_flexid(query, id)
    incl_filters = Q()
    for i in info_include or []:
        incl_filters |= Q(info__tag__startswith=i)

    excl_filters = Q()
    for i in info_exclude or []:
        excl_filters |= Q(info__tag__startswith=i)
    query = query.filter(~excl_filters & incl_filters)
    return ContentFetchQueryset(query, actions)
