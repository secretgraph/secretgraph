from urllib.parse import urlencode
import logging

from django import template
from django.conf import settings
from django.shortcuts import resolve_url
from django.utils.safestring import mark_safe
from django.utils.html import escape
from django.core.paginator import Paginator

from django.db.models import Q, Subquery

from secretgraph.server.utils.mark import freeze_contents, update_file_accessed

from ..models import Content, Cluster
from ..utils.auth import get_cached_result, fetch_by_id
from ..actions.fetch import (
    fetch_clusters as _fetch_clusters,
    fetch_contents as _fetch_contents,
)
from ..utils.encryption import iter_decrypt_contents
from ...core import constants

try:
    from bleach import sanitizer

    try:
        from bleach.css_sanitizer import CSSSanitizer

        css_sanitizer = CSSSanitizer()
    except ImportError:
        logging.warning("tinycss2 not found, cannot sanitize css")
        css_sanitizer = None

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
    cleach_cleaner = sanitizer.Cleaner(
        tags=_default_allowed_tags,
        attributes=lambda tag, name, value: True,
        protocols=_default_allowed_protocols,
        css_sanitizer=css_sanitizer,
    )

    def clean(inp):

        return cleach_cleaner.clean(inp)

except ImportError:
    logging.warning("bleach not found, fallback to escape")
    cleach_cleaner = None
    clean = escape


def _split_comma(inp):
    if not inp:
        return inp
    return inp.split(",") if isinstance(inp, str) else inp


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
    ids=None,
    excludeIds=None,
    includeTags=None,
    excludeTags=None,
    authorization=None,
):
    queryset = get_cached_result(context["request"], authset=authorization)[
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
        queryset = queryset.order_by(*_split_comma(order_by))
    else:
        queryset = queryset.order_by("-updated")

    if excludeIds is not None:
        queryset = queryset.exclude(
            Q(
                id__in=Subquery(
                    fetch_by_id(
                        Cluster.objects.all(),
                        _split_comma(excludeIds),
                        limit_ids=None,
                        check_short_id=True,
                        check_short_name=True,
                    ).values("id")
                )
            )
        )
    return Paginator(
        _fetch_clusters(
            queryset.distinct(),
            ids=_split_comma(ids),
            limit_ids=None,
            includeTags=_split_comma(includeTags),
            excludeTags=_split_comma(excludeTags),
        ),
        page_size,
    ).get_page(page)


@register.simple_tag(takes_context=True)
def fetch_contents(
    context,
    page=1,
    page_size=20,
    order_by=None,
    public=None,
    featured=None,
    deleted=False,
    clusters=None,
    states=None,
    ids=None,
    excludeIds=None,
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
    results = get_cached_result(context["request"], authset=authorization)
    result = results["Content"].copy()

    if deleted is not None:
        result["objects"] = result["objects"].filter(
            markForDestruction__isnull=not deleted
        )

    if clusters:
        clusters = _split_comma(clusters)
        result["objects"] = result["objects"].filter(
            cluster_id__in=Subquery(
                fetch_by_id(
                    results["Cluster"]["objects"],
                    clusters,
                    limit_ids=None,
                    check_short_id=True,
                    check_short_name=True,
                ).values("id")
            )
        )
    if states:
        states = _split_comma(states)

    if public is True:
        if states:
            states = constants.public_states.intersection(states)
        else:
            states = constants.public_states

    elif public is False:
        if states:
            states = set(states).difference(constants.public_states)
        else:
            result["objects"] = result["objects"].exclude(
                state__in=constants.public_states
            )
    if featured is not None:
        result["objects"] = result["objects"].filter(
            cluster__featured=bool(featured)
        )
    if excludeIds is not None:
        result["objects"] = result["objects"].exclude(
            Q(
                id__in=Subquery(
                    fetch_by_id(
                        Content.objects.all(),
                        _split_comma(excludeIds),
                        limit_ids=None,
                        check_short_id=True,
                    ).values("id")
                )
            )
        )
    if order_by:
        result["objects"] = result["objects"].order_by(*_split_comma(order_by))
    else:
        result["objects"] = result["objects"].order_by("-updated")
    result["objects"] = _fetch_contents(
        result["objects"],
        ids=_split_comma(ids),
        limit_ids=None,
        clustersAreRestricted=bool(clusters),
        states=states,
        includeTypes=_split_comma(includeTypes),
        excludeTypes=_split_comma(excludeTypes),
        includeTags=_split_comma(includeTags),
        excludeTags=_split_comma(excludeTags),
    )

    if decrypt or default_decryptkeys:
        decryptset = set()
        if decrypt:
            decryptset.update(
                context["request"]
                .headers.get("X-Key", "")
                .replace(" ", "")
                .split(",")
            )
            decryptset.update(context["request"].GET.getlist("key"))
        if default_decryptkeys:
            decryptset.update(
                default_decryptkeys.split(",")
                if isinstance(default_decryptkeys, str)
                else default_decryptkeys
            )
        decryptset.discard("")

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


@register.simple_tag(takes_context=True)
def read_content_sync(
    context,
    content,
    authorization=None,
    # provide default decrypt keys
    default_decryptkeys=None,
    # use bleach/escape for text contents which can be inlined
    inline_text=True if cleach_cleaner else False,
):
    if not authorization:
        authorization = set(
            context["request"]
            .headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authorization.update(context["request"].GET.getlist("token"))
        authorization.discard("")
    if isinstance(content, str):
        result = get_cached_result(context["request"], authset=authorization)[
            "Content"
        ].copy()
        result["objects"] = fetch_by_id(result["objects"], content)

        decryptset = set(
            context["request"]
            .headers.get("X-Key", "")
            .replace(" ", "")
            .split(",")
        )
        decryptset.update(context["request"].GET.getlist("key"))
        if default_decryptkeys:
            decryptset.update(
                default_decryptkeys.split(",")
                if isinstance(default_decryptkeys, str)
                else default_decryptkeys
            )
        decryptset.discard("")
        content = next(
            iter_decrypt_contents(result, decryptset=decryptset),
            None,
        )
    assert isinstance(content, Content), "Can only handle Contents"
    assert hasattr(content, "tags_proxy"), (
        "content lacks tags_proxy "
        "(set by iter_decrypt_contents, decrypt flag)"
    )
    decryptqpart = {}
    if authorization:
        decryptqpart["token"] = authorization
    if hasattr(content, "read_decrypt"):
        decryptqpart["key"] = content.read_decrypt.key

    decryptqpart = urlencode(
        decryptqpart,
        doseq=True,
    )
    if content.type in {"Text", "File"}:
        name = content.tags_proxy.name[0]
        if not isinstance(name, str):
            name = None

        mime = content.tags_proxy.mime[0]
        if not mime or not isinstance(mime, str):
            mime = "application/octet-stream"
        if mime.startswith("text/"):
            if not inline_text or getattr(content, "start_transfer", None):
                return mark_safe(
                    f"""
<iframe sandbox src="{content.link}?decrypt&{decryptqpart}">
    iframes not supported
</iframe>"""
                )
            update_file_accessed([content.id])
            freeze_contents([content.id], context["request"], update=True)
            text = (
                content.read_decrypt().read().decode("utf8")
                if hasattr(content, "read_decrypt")
                else content.file.open("r").read()
            )
            if mime == "text/html":
                return mark_safe(clean(text))
            else:
                return mark_safe("<pre>{}</pre>".format(escape(text)))
        elif mime.startswith("audio/") or mime.startswith("video/"):
            return mark_safe(
                f"""
<video controls>
    <source
        src="{content.link}?decrypt&{decryptqpart}"
        style="width: 100%"
    />
</video>"""
            )
        elif mime.startswith("image/"):
            return mark_safe(
                f"""
<a href="{content.link}?decrypt&{decryptqpart}">
        <img
            loading="lazy"
            src="{content.link}?decrypt&{decryptqpart}"
            alt="{name}"
            style="width: 100%"
        />
    </a>"""
            )
    return mark_safe(
        f"""<a href="{content.link}?decrypt&{decryptqpart}">Download</a>"""
    )
