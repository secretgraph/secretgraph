from urllib.parse import urlencode
from contextvars import ContextVar

from django import template
from django.conf import settings
from django.shortcuts import resolve_url
from django.utils.html import escape
from django.core.paginator import Paginator

from django.db.models import Q, Subquery

from ..models import Content
from ..utils.auth import get_cached_result, fetch_by_id
from ..actions.view import (
    fetch_clusters as _fetch_clusters,
    fetch_contents as _fetch_contents,
    ContentFetchQueryset,
)
from ..utils.encryption import iter_decrypt_contents
from ...core import constants

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
    page=1,
    page_size=20,
    order_by=None,
    featured=True,
    public=True,
    deleted=False,
    search=None,
    includeTags=None,
    excludeTags=None,
    authorization=None,
):
    queryset = get_cached_result(context.request, authset=authorization)[
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
        queryset = queryset.filter(globalNameRegisteredAt__isnull=not public)
    if featured is not None:
        queryset = queryset.filter(featured=featured)
    if order_by:
        queryset = queryset.order_by(*order_by)
    else:
        queryset = queryset.order_by("flexid_cached")
    return Paginator(
        _fetch_clusters(
            queryset.distinct(),
            includeTags=includeTags.split(",")
            if isinstance(includeTags, str)
            else includeTags,
            excludeTags=excludeTags.split(",")
            if isinstance(excludeTags, str)
            else excludeTags,
        ),
        page_size,
    ).get_page(page)


@register.simple_tag(takes_context=True)
def fetch_contents(
    context,
    page=1,
    page_size=20,
    order_by=None,
    public=True,
    deleted=False,
    clusters=None,
    includeTypes=None,
    excludeTypes=None,
    includeTags=None,
    excludeTags=None,
    # fetch decrypt keys from request
    decrypt=True,
    # provide default decrypt keys
    default_decryptkeys=None,
    authorization=None,
):
    result = get_cached_result(context.request, authset=authorization)[
        "Content"
    ].copy()

    if deleted is not None:
        result["objects"] = result["objects"].filter(
            markForDestruction__isnull=not deleted
        )
    if public is not None:
        # should only include public contents with public cluster
        # if no clusters are specified (e.g. root query)
        if public is True:
            if not clusters:
                result["objects"] = result["objects"].filter(
                    state__in=constants.public_states,
                    cluster__globalNameRegisteredAt__isnull=False,
                )
            else:
                result["objects"] = result["objects"].filter(
                    state__in=constants.public_states
                )
        else:
            result["objects"] = result["objects"].exclude(
                state__in=constants.public_states
            )
    else:
        # only private or public with cluster public
        result["objects"] = result["objects"].filter(
            ~Q(state__in=constants.public_states)
            | Q(cluster__globalNameRegisteredAt__isnull=False)
        )
    if clusters:
        result["objects"] = fetch_by_id(
            result["objects"],
            clusters.split(",") if isinstance(clusters, str) else clusters,
            prefix="cluster__",
            limit_ids=None,
        )
    if order_by:
        result["objects"] = result["objects"].order_by(*order_by)
    result["objects"] = _fetch_contents(
        result["objects"],
        result["actions"],
        includeTypes=includeTypes.split(",")
        if isinstance(includeTypes, str)
        else includeTypes,
        excludeTypes=excludeTypes.split(",")
        if isinstance(excludeTypes, str)
        else excludeTypes,
        includeTags=includeTags.split(",")
        if isinstance(includeTags, str)
        else includeTags,
        excludeTags=excludeTags.split(",")
        if isinstance(excludeTags, str)
        else excludeTags,
    )

    if decrypt or default_decryptkeys:
        decryptset = set()
        if decrypt:
            decryptset.update(
                context.request.headers.get("X-Key", "")
                .replace(" ", "")
                .split(",")
            )
            decryptset.update(context.request.GET.getlist("key"))
        if default_decryptkeys:
            decryptset.update(
                default_decryptkeys.split(",")
                if isinstance(default_decryptkeys, str)
                else default_decryptkeys
            )

        def gen(queryset):
            for content in iter_decrypt_contents(
                result,
                queryset=queryset,
                decryptset=decryptset,
            ):
                yield content

        page = Paginator(result["objects"], page_size).get_page(page)
        page.object_list = list(
            gen(
                (
                    result["objects"].filter(
                        pk__in=Subquery(page.object_list.values("pk"))
                    )
                )
            )
        )

        return page
    else:
        return Paginator(result["objects"], page_size).get_page(page)


@register.filter(takes_context=True, is_safe=True)
def read_content_sync(
    context,
    content,
    authorization=None,
    # provide default decrypt keys
    default_decryptkeys=None,
):
    if not authorization:
        authorization = set(
            context["request"]
            .headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authorization.update(context["request"].GET.getlist("token"))
    if isinstance(content, str):
        result = get_cached_result(context.request, authset=authorization)[
            "Content"
        ].copy()
        result["objects"] = ContentFetchQueryset(
            fetch_by_id(result["objects"], content)
        )

        decryptset = set(
            context.request.headers.get("X-Key", "")
            .replace(" ", "")
            .split(",")
        )
        decryptset.update(context.request.GET.getlist("key"))
        if default_decryptkeys:
            decryptset.update(
                default_decryptkeys.split(",")
                if isinstance(default_decryptkeys, str)
                else default_decryptkeys
            )
        content = next(
            iter_decrypt_contents(result, decryptset=decryptset),
            None,
        )
    assert isinstance(content, Content), "Can only handle Contents"
    assert hasattr(content, "read_decrypt"), (
        "content lacks read_decrypt "
        "(set by iter_decrypt_contents, decrypt flag)"
    )
    decryptqpart = urlencode({"token": authorization}, doseq=True)
    if hasattr(content, "read_decrypt") and content.type in {"Text", "File"}:
        name = content.tags.filter(tag__startswith="name=").first()
        if name:
            name = name.tag.split("=")[1]

        mime = getattr(content, "read_decrypt_mime", None)
        if not mime:
            mime = "application/octet-stream"
        if mime.startswith("text/"):
            text = content.read_decrypt()
            if mime == "text/html":
                return clean(text)
            else:
                return "<pre>{}</pre>".format(escape(text))
        elif mime.startswith("audio/") or mime.startswith("video/"):
            return f"""
<video controls>
    <source
        src="{content.link}?decrypt&{decryptqpart}"
        style="width: 100%"
    />
</video>"""
        elif mime.startswith("image/"):
            return f"""
<a href="{content.link}?decrypt&{decryptqpart}">
        <img
            loading="lazy"
            src="{content.link}?decrypt&{decryptqpart}"
            alt="{name}"
            style="width: 100%"
        />
    </a>"""
    return f"""<a href="{content.link}?decrypt&{decryptqpart}">Download</a>"""
