import logging
from datetime import datetime as dt
from typing import Optional

from django.db.models import Q, QuerySet, Subquery

from ...core.constants import public_states
from ..models import Cluster, Content
from ..utils.auth import fetch_by_id

logger = logging.getLogger(__name__)


def fetch_clusters(
    query,
    ids=None,  # relaxed id check
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
        query = fetch_by_id(
            query,
            ids,
            limit_ids=limit_ids,
            check_short_id=True,
            check_short_name=True,
        )

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
        state_filters = ~Q(state="sensitive")
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


def fetch_contents(
    query,
    ids=None,  # relaxed id check
    limit_ids=1,
    states=None,
    clustersAreRestricted=False,
    includeTypes=None,
    excludeTypes=None,
    includeTags=None,
    excludeTags=None,
    contentHashes=None,
    minUpdated=None,
    maxUpdated=None,
) -> QuerySet[Content]:
    if ids:
        query = fetch_by_id(
            query,
            ids,
            check_short_id=True,
            limit_ids=limit_ids,
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
        state_filters = ~Q(state="sensitive")
        if states:
            if clustersAreRestricted:
                state_filters = Q(state__in=states)
            else:
                state_filters = Q(
                    state__in=set(states).difference(public_states)
                ) | Q(
                    state__in=public_states.intersection(states),
                    cluster__globalNameRegisteredAt__isnull=False,
                )

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
    return query
