from django import template
from django.conf import settings
from django.shortcuts import resolve_url

from django.db.models import Q

from ..models import Content
from ..utils.auth import initializeCachedResult, fetch_by_id
from ..actions.view import (
    fetch_clusters as _fetch_clusters,
    fetch_contents as _fetch_contents,
)

register = template.Library()


@register.simple_tag()
def secretgraph_path():
    return resolve_url(
        getattr(settings, "SECRETGRAPH_GRAPHQL_PATH", "/graphql")
    )


@register.simple_tag(takes_context=True)
def fetch_clusters(
    context,
    order_by=None,
    featured=True,
    public=True,
    search=None,
    includeTags=["type=text/plain", "text/html"],
    excludeTags=None,
    authorization=None,
):
    queryset = initializeCachedResult(context.request, authset=authorization)[
        "Cluster"
    ]["objects"]
    if search is not None:
        queryset = queryset.filter(
            Q(flexid_cached__startswith=search)
            | Q(description__icontains=search)
        )

    if public is not None:
        queryset = queryset.filter(public=public)
    if featured is not None:
        queryset = queryset.filter(featured=featured)
    if order_by:
        queryset = queryset.order_by(*order_by)
    return _fetch_clusters(
        queryset.distinct(), includeTags=includeTags, excludeTags=excludeTags
    )


@register.simple_tag(takes_context=True)
def fetch_contents(
    context,
    order_by=None,
    public=True,
    clusters=None,
    includeTags=["type=text/plain", "type=text/html"],
    excludeTags=None,
    authorization=None,
):
    queryset = initializeCachedResult(context.request, authset=authorization)[
        "Content"
    ]["objects"]
    if public is not None:
        # should only include public contents with public cluster
        # if no clusters are specified (e.g. root query)
        if public is True:
            if not clusters:
                queryset = queryset.filter(
                    tags__tag="state=public", cluster__public=True
                )
            else:
                queryset = queryset.filter(tags__tag="state=public")
        else:
            queryset = queryset.exclude(tags__tag="state=public")
    else:
        # only private or public with cluster public
        queryset = queryset.filter(
            ~Q(tags__tag="state=public") | Q(cluster__public=True)
        )
    if clusters:
        queryset = fetch_by_id(
            queryset,
            clusters,
            prefix="cluster__",
            limit_ids=None,
        )
    if order_by:
        queryset = queryset.order_by(*order_by)
    return _fetch_contents(
        queryset.distinct(), includeTags=includeTags, excludeTags=excludeTags
    )


@register.filter()
def read_content(content):
    assert isinstance(content, Content), "Can only handle Contents"
    assert content.tags.filter("type=Text").exists(), "Must be text"
    assert content.tags.filter(
        "state=public"
    ).exists(), "Cannot handle encrypted contents"
    with content.file.open("rt") as f:
        return f.read()
