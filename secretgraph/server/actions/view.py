import logging
from datetime import timedelta as td, datetime as dt
from typing import Optional
from django.db.utils import IntegrityError

from django.db.models import Q, QuerySet, Subquery, Exists, OuterRef
from django.utils import timezone

from ..utils.auth import fetch_by_id
from ..models import Cluster, Content, ContentAction, ContentTag

logger = logging.getLogger(__name__)


def fetch_clusters(
    query,
    ids=None,
    limit_ids: Optional[int] = 1,
    states=None,
    includeTypes=None,
    excludeTypes=None,
    includeTags=None,
    excludeTags=None,
    contentHashes=None,
    minUpdated=None,
    maxUpdated=None,
) -> QuerySet[Cluster]:
    if ids:
        query = fetch_by_id(query, ids, limit_ids=limit_ids)

    if (
        includeTags
        or excludeTags
        or contentHashes
        or includeTypes
        or excludeTypes
        or states
    ):
        incl_filters = Q()
        for i in includeTags or []:
            if i.startswith("id="):
                incl_filters |= Q(flexid_cached=i[3:])
            elif i.startswith("=id="):
                incl_filters |= Q(flexid_cached=i[4:])
            elif i.startswith("="):
                incl_filters |= Q(tags__tag=i[1:])
            else:
                incl_filters |= Q(tags__tag__startswith=i)

        hash_filters = Q()
        if contentHashes:
            hash_filters = Q(contentHash__in=contentHashes)
        state_filters = Q()
        if states:
            state_filters = Q(state__in=states)
        incl_type_filters = Q()
        excl_type_filters = Q()
        if includeTypes:
            incl_type_filters = Q(type__in=includeTypes)
        elif excludeTypes:
            excl_type_filters = Q(type__in=excludeTypes)

        excl_filters = Q()
        for i in excludeTags or []:
            if i.startswith("id="):
                excl_filters |= Q(flexid_cached=i[3:])
            elif i.startswith("=id="):
                excl_filters |= Q(flexid_cached=i[4:])
            elif i.startswith("="):
                excl_filters |= Q(tags__tag=i[1:])
            else:
                excl_filters |= Q(tags__tag__startswith=i)
        query = query.filter(
            id__in=Subquery(
                Content.objects.filter(
                    (~excl_filters)
                    & incl_filters
                    & hash_filters
                    & incl_type_filters
                    & (~excl_type_filters)
                    & state_filters
                ).values("cluster_id")
            )
        )

    if minUpdated and not maxUpdated:
        maxUpdated = dt.max
    elif maxUpdated and not minUpdated:
        minUpdated = dt.min

    if minUpdated or maxUpdated:
        query = query.filter(
            Q(updated__range=(minUpdated, maxUpdated))
            | Q(contents__updated__range=(minUpdated, maxUpdated))
        )

    return query


class ContentFetchQueryset(QuerySet[Content]):
    """
    Tracks usage of contents and mark accordingly Content for removal
    """

    only_direct_fetch_trigger = False
    actions = None

    def __init__(
        self,
        query=None,
        actions=None,
        only_direct_trigger=False,
        ttl_hours=24,
        **kwargs,
    ):
        if actions is None:
            actions = getattr(query, "actions", None)
        if actions is not None:
            self.actions = actions
        self.only_direct_trigger = only_direct_trigger
        self.ttl_hours = ttl_hours
        kwargs["model"] = kwargs.get("model", None) or query.model
        super().__init__(query=query, **kwargs)

    def _clone(self):
        """
        Return a copy of the current QuerySet. A lightweight alternative
        to deepcopy().
        """
        c = super()._clone()
        c.actions = self.actions
        c.ttl_hours = self.ttl_hours
        c.only_direct_trigger = self.only_direct_trigger
        return c

    def trigger_view_actions(self, objects, direct=True):
        """
        Trigger fetch handling stuff
        fetch=delete after read
        """
        assert self.actions is not None, "actions is None"
        if self.only_direct_trigger and not direct:
            return objects
        if objects is None or not self.ttl_hours:
            return objects
        elif isinstance(objects, (Content,)):
            used_actions = ContentAction.objects.filter(
                content=objects, action__in=self.actions
            )
        else:
            # is iterator
            if hasattr(objects, "__next__"):
                objects = list(objects)
            used_actions = ContentAction.objects.filter(
                content__in=objects, action__in=self.actions
            )

        if used_actions:
            used_actions.update(used=True)
            markForDestruction = timezone.now() + td(hours=self.ttl_hours)
            Content.objects.filter(
                Q(markForDestruction=None)
                | Q(markForDestruction__gt=markForDestruction),
                actions__group="fetch",
            ).exclude(
                Exists(
                    used_actions.filter(
                        group="fetch", used=False, content_id=OuterRef("pk")
                    )
                )
            ).update(
                markForDestruction=markForDestruction
            )
            while True:
                # cleanup freeze tags in case of immutable is available
                ContentTag.objects.filter(
                    tag="freeze",
                    content_id__in=Subquery(
                        ContentTag.objects.filter(tag="immutable").values(
                            "content_id"
                        )
                    ),
                ).delete()
                # try to rename to immutable. this can fail if immutable
                # already exists. This case should never happen but be sure
                try:
                    ContentTag.objects.filter(
                        tag="freeze",
                        content_id__in=Subquery(
                            used_actions.filter(
                                group__in=["fetch", "view"],
                                used=True,
                                content_id=OuterRef("id"),
                            ).values("content_id")
                        ),
                    ).update(tag="immutable")
                    break
                except IntegrityError as exc:
                    logger.warning(
                        "could not rename freeze tag, name clash, retry",
                        exc,
                    )
        return objects

    def __iter__(self):
        for i in self.trigger_view_actions(super().__iter__(), False):
            yield i

    def __getitem__(self, key):
        return self.trigger_view_actions(super().__getitem__(key), False)

    def get(self, *args, **kwargs):
        return self.trigger_view_actions(super().get(*args, **kwargs), False)

    def first(self):
        return self.trigger_view_actions(super().first(), False)

    def last(self):
        return self.trigger_view_actions(super().last(), False)

    def earliest(self):
        return self.trigger_view_actions(super().earliest(), False)

    def latest(self):
        return self.trigger_view_actions(super().latest(), False)


def fetch_contents(
    query,
    actions,
    ids=None,
    limit_ids=1,
    states=None,
    includeTypes=None,
    excludeTypes=None,
    includeTags=None,
    excludeTags=None,
    contentHashes=None,
    noFetch=False,
    minUpdated=None,
    maxUpdated=None,
) -> ContentFetchQueryset[Content]:
    assert actions is not None, "actions is None"
    assert not isinstance(actions, str), "actions is str"
    if ids:
        query = fetch_by_id(
            query, ids, check_content_hash=True, limit_ids=limit_ids
        )
    if (
        includeTags
        or excludeTags
        or contentHashes
        or states
        or includeTypes
        or excludeTypes
    ):
        incl_filters = Q()
        excl_filters = Q()
        # only if tags are specified the filtering starts,
        # empty array does no harm
        for i in includeTags or []:
            if i.startswith("id="):
                incl_filters |= Q(flexid_cached=i[3:])
            elif i.startswith("=id="):
                incl_filters |= Q(flexid_cached=i[4:])
            elif i.startswith("="):
                incl_filters |= Q(tags__tag=i[1:])
            else:
                incl_filters |= Q(tags__tag__startswith=i)

        # only if tags are specified the filtering starts,
        # empty array does no harm
        for i in excludeTags or []:
            if i.startswith("id="):
                excl_filters |= Q(flexid_cached=i[3:])
            elif i.startswith("=id="):
                excl_filters |= Q(flexid_cached=i[4:])
            elif i.startswith("="):
                excl_filters |= Q(tags__tag=i[1:])
            else:
                excl_filters |= Q(tags__tag__startswith=i)
        hash_filters = Q()
        if contentHashes:
            hash_filters = Q(contentHash__in=contentHashes)
        state_filters = Q()
        if states:
            state_filters = Q(state__in=states)
        incl_type_filters = Q()
        excl_type_filters = Q()
        if includeTypes:
            incl_type_filters = Q(type__in=includeTypes)
        elif excludeTypes:
            excl_type_filters = Q(type__in=excludeTypes)

        query = query.filter(
            (~excl_filters)
            & (~excl_type_filters)
            & incl_filters
            & hash_filters
            & incl_type_filters
            & state_filters
        )

    if minUpdated and not maxUpdated:
        maxUpdated = dt.max
    elif maxUpdated and not minUpdated:
        minUpdated = dt.min

    if minUpdated or maxUpdated:
        query = query.filter(updated__range=(minUpdated, maxUpdated))
    return ContentFetchQueryset(
        query.query, actions=actions, only_direct_trigger=noFetch
    )
