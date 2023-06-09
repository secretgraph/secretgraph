from datetime import datetime
from typing import Optional

from strawberry_django_plus import gql

from .shared import UseCriteria, UseCriteriaPublic


@gql.input
class ContentFilterCluster:
    states: Optional[list[str]] = None
    includeTypes: Optional[list[str]] = None
    excludeTypes: Optional[list[str]] = None
    includeTags: Optional[list[str]] = None
    excludeTags: Optional[list[str]] = gql.django.field(
        default=None,
        description="Use id=xy for excluding contents with ids",
    )
    contentHashes: Optional[list[str]] = None
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None
    deleted: Optional[UseCriteria] = None
    hidden: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE


@gql.input
class ContentFilter(ContentFilterCluster):
    clusters: Optional[list[gql.ID]] = None
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE


@gql.input
class ClusterFilter:
    search: Optional[str] = gql.field(
        default=None, description="Search description, id and name"
    )
    states: Optional[list[str]] = None
    includeTypes: Optional[list[str]] = None
    excludeTypes: Optional[list[str]] = None
    includeTags: Optional[list[str]] = None
    excludeTags: Optional[list[str]] = gql.field(
        default=None,
        description="Use id=xy for excluding clusters with content ids",
    )
    ids: Optional[list[gql.ID]] = gql.field(
        default=None,
        description="Filter clusters with ids or global name",
    )
    excludeIds: Optional[list[gql.ID]] = gql.field(
        default=None,
        description="Use for excluding clusters with ids or global names",
    )
    contentHashes: Optional[list[str]] = None
    featured: UseCriteria = UseCriteria.IGNORE
    primary: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None
