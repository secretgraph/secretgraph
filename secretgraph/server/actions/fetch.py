import logging
from datetime import datetime as dt
from typing import Optional

from django.db.models import Q, QuerySet, Subquery

from ...core.constants import public_states
from ..models import Cluster, ClusterGroup, Content
from ..utils.auth import fetch_by_id

logger = logging.getLogger(__name__)


def _prefix_topic(inp: str):
    return f"topic_{inp}"


def fetch_clusters(
    query,
    ids=None,  # relaxed id check
    limit_ids: Optional[int] = 1,
    includeTopics=None,
    excludeTopics=None,
    includeTypes=None,
    excludeTypes=None,
    minUpdated=None,
    maxUpdated=None,
) -> QuerySet[Cluster]:
    # returns only consistent results
    if ids is not None:
        query = fetch_by_id(
            query,
            ids,
            limit_ids=limit_ids,
            check_long=True,
            check_short_id=True,
            check_short_name=True,
        )
    query = Cluster.objects.consistent(query)
    if includeTopics:
        if excludeTopics:
            includeTopics = set(includeTopics)
            includeTopics.difference_update(excludeTopics)
        cgquery = ClusterGroup.objects.filter(
            name__in=list(map(_prefix_topic, includeTopics)), hidden=False
        )
    elif excludeTopics:
        cgquery = ClusterGroup.objects.exclude(
            name__in=list(map(_prefix_topic, excludeTopics)), hidden=False
        )

        query = query.filter(groups__id__in=Subquery(cgquery.values("id")))
    if includeTypes or excludeTypes or minUpdated or maxUpdated:
        content_query = Content.objects.all()
        # because no specific tags can be queried and there is no introspection into the content
        # it is safe to allow querying types without restriction
        if includeTypes:
            if excludeTypes:
                includeTypes = set(includeTypes)
                includeTypes.difference_update(excludeTypes)
            content_query = content_query.filter(
                type__in=includeTypes, markForDestruction__isnull=True
            )
        elif excludeTypes:
            content_query = content_query.exclude(
                type__in=excludeTypes, markForDestruction__isnull=True
            )

        if minUpdated and not maxUpdated:
            maxUpdated = dt.max
        elif maxUpdated and not minUpdated:
            minUpdated = dt.min

        if minUpdated or maxUpdated:
            query = query.filter(
                Q(updated__range=(minUpdated, maxUpdated))
                | Q(
                    id__in=Subquery(
                        content_query.filter(
                            updated__range=(minUpdated, maxUpdated)
                        ).values("cluster_id")
                    )
                )
            )
        else:
            assert includeTypes or excludeTypes
            query = query.filter(
                Q(id__in=Subquery(content_query.values("cluster_id")))
            )
    return query


def fetch_contents(
    query,
    ids=None,  # relaxed id check
    limit_ids=1,
    states=None,
    clustersAreRestrictedOrAdmin=False,
    safeListedContents=None,
    includeTypes=None,
    excludeTypes=None,
    includeTags=None,
    excludeTags=None,
    contentHashes=None,
    minUpdated=None,
    maxUpdated=None,
) -> QuerySet[Content]:
    # returns only consistent results
    if ids is not None:
        query = fetch_by_id(
            query,
            ids,
            check_short_id=True,
            limit_ids=limit_ids,
        )
    query = Content.objects.consistent(query)
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
        state_filters = ~Q(state__in={"sensitive", "draft"})
        if states:
            if clustersAreRestrictedOrAdmin or ids is not None:
                state_filters = Q(state__in=states)
            else:
                s_intern = set(states)
                s_intern.difference_update(public_states)
                # allow only
                state_filters = Q(state__in=s_intern) | Q(
                    state__in=public_states.intersection(states),
                    cluster__globalNameRegisteredAt__isnull=False,
                )
                if safeListedContents:
                    state_filters |= Q(
                        state__in=states, id__in=safeListedContents
                    )

        incl_type_filters = Q()
        excl_type_filters = Q()
        if includeTypes:
            if excludeTypes:
                includeTypes = set(includeTypes)
                includeTypes.difference_update(excludeTypes)
            incl_type_filters = Q(type__in=includeTypes)
        elif excludeTypes:
            excl_type_filters = Q(type__in=excludeTypes)
        else:
            excl_type_filters = Q(type="External")

        query = query.filter(
            (~excl_filters)
            & (~excl_type_filters)
            & incl_filters
            & hash_filters
            & incl_type_filters
            & state_filters
        )
    else:
        # we need to handle the case no extra filters are applied
        if clustersAreRestrictedOrAdmin or ids:
            query = query.exclude(state__in={"sensitive", "draft"})
        else:
            # only include protected and public of public cluster
            query = query.filter(
                Q(state="protected")
                | (
                    Q(
                        state__in=public_states,
                        cluster__globalNameRegisteredAt__isnull=False,
                    )
                )
            )
        query = query.exclude(type="External")
    if not clustersAreRestrictedOrAdmin and not ids:
        q = Q(type="PublicKey", state__in=public_states)
        if safeListedContents:
            q &= ~Q(id_in=safeListedContents)
        query = query.exclude(q)

    if minUpdated and not maxUpdated:
        maxUpdated = dt.max
    elif maxUpdated and not minUpdated:
        minUpdated = dt.min

    if minUpdated or maxUpdated:
        query = query.filter(updated__range=(minUpdated, maxUpdated))
    return query
