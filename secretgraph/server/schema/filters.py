from datetime import datetime
from typing import Optional

import strawberry

from .shared import UseCriteria, UseCriteriaPublic


@strawberry.input
class ContentFilterCluster:
    states: Optional[list[str]] = None
    includeTypes: Optional[list[str]] = None
    excludeTypes: Optional[list[str]] = None
    includeTags: Optional[list[str]] = None
    excludeTags: Optional[list[str]] = strawberry.field(
        default=None,
        description="Use id=xy for excluding contents with ids",
    )
    contentHashes: Optional[list[str]] = None
    minUpdated: Optional[datetime] = None
    maxUpdated: Optional[datetime] = None
    deleted: Optional[UseCriteria] = None
    hidden: UseCriteria = UseCriteria.FALSE
    public: UseCriteriaPublic = UseCriteriaPublic.IGNORE


@strawberry.input
class ContentFilter(ContentFilterCluster):
    clusters: Optional[list[strawberry.ID]] = None
    featured: UseCriteria = UseCriteria.IGNORE
    deleted: UseCriteria = UseCriteria.FALSE


@strawberry.input
class ClusterFilter:
    search: Optional[str] = strawberry.field(
        default=None, description="Search description, id and name"
    )
    states: Optional[list[str]] = None
    includeTypes: Optional[list[str]] = None
    excludeTypes: Optional[list[str]] = None
    includeTags: Optional[list[str]] = None
    excludeTags: Optional[list[str]] = strawberry.field(
        default=None,
        description="Use id=xy for excluding clusters with content ids",
    )
    ids: Optional[list[strawberry.ID]] = strawberry.field(
        default=None,
        description="Filter clusters with ids or global name",
    )
    excludeIds: Optional[list[strawberry.ID]] = strawberry.field(
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


@strawberry.input
class ContentReferenceFilter:
    states: Optional[list[str]] = None
    includeTypes: Optional[list[str]] = None
    excludeTypes: Optional[list[str]] = None
    includeTags: Optional[list[str]] = None
    excludeTags: Optional[list[str]] = None
    contentHashes: Optional[list[str]] = None
    deleted: UseCriteria = UseCriteria.FALSE
    groups: Optional[list[str]] = None
