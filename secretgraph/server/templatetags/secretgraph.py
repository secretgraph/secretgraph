from django import template
from django.conf import settings
from django.shortcuts import resolve_url
from django.utils.html import escape

from django.db.models import Q

from contextvars import ContextVar

from ..models import Content
from ..utils.auth import initializeCachedResult, fetch_by_id
from ..actions.view import (
    fetch_clusters as _fetch_clusters,
    fetch_contents as _fetch_contents,
)

try:
    from bleach import sanitizer

    _default_allowed_tags = sanitizer.ALLOWED_TAGS + [
        "img",
        "p",
        "br",
        "sub",
        "sup",
        "h1",
        "h2",
        "h3",
        "h4",
        "pre",
        "del",
        "audio",
        "source",
        "video",
    ]
    _default_allowed_protocols = sanitizer.ALLOWED_PROTOCOLS + [
        "data",
        "mailto",
    ]
    cleaner = ContextVar("bleach_cleaner", default=None)

    def clean(inp):
        if not cleaner.get():
            cleaner.set(
                sanitizer.Cleaner(
                    tags=_default_allowed_tags,
                    attributes=lambda tag, name, value: True,
                    styles=sanitizer.allowed_css_properties,
                    protocols=_default_allowed_protocols,
                )
            )

        return cleaner.get().clean(inp)

except ImportError:

    clean = escape


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
    deleted=False,
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
    if deleted is not None:
        queryset = queryset.filter(markForDestruction__isnull=not deleted)

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
    deleted=False,
    clusters=None,
    includeTags=["type=text/plain", "type=text/html"],
    excludeTags=None,
    authorization=None,
):
    queryset = initializeCachedResult(context.request, authset=authorization)[
        "Content"
    ]["objects"]

    if deleted is not None:
        queryset = queryset.filter(markForDestruction__isnull=not deleted)
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


@register.filter(takes_context=True, is_safe=True)
def read_content(context, content, authset=None):
    if not authset:
        authset = set(
            request.headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.update(context["request"].GET.getlist("token"))
    assert isinstance(content, Content), "Can only handle Contents"
    assert content.tags.filter("type=Text").exists(), "Must be text"
    assert content.tags.filter(
        tag="state=public"
    ).exists(), "Cannot handle encrypted contents yet"
    mime = content.tags.filter(tag__startswith="mime=").first()
    if not mime:
        raise ValueError("Invalid Text")
    mime = mime.tag.split("=", 1)[1]
    with content.file.open("rt") as f:
        text = f.read()
        if mime == "text/html":
            return clean(text)
        else:
            return escape(text)
