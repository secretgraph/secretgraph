import base64
import json
import logging
import pprint

from django.conf import settings
from django.core.paginator import Paginator
from django.db.models import OuterRef, Q, Subquery
from django.http import (
    FileResponse,
    Http404,
    HttpResponse,
    HttpResponseRedirect,
    JsonResponse,
    StreamingHttpResponse,
)
from django.shortcuts import resolve_url
from django.urls import reverse
from django.views.generic.edit import FormView
from graphene_file_upload.django import FileUploadGraphQLView

from .actions.view import ContentFetchQueryset
from .forms import PreKeyForm, PushForm, UpdateForm
from .models import Content
from .utils.auth import (
    fetch_by_id,
    initializeCachedResult,
    retrieve_allowed_objects,
)
from .utils.encryption import iter_decrypt_contents

logger = logging.getLogger(__name__)


class AllowCORSMixin(object):
    def add_cors_headers(self, response):
        response["Access-Control-Allow-Origin"] = "*"
        if self.request.method == "OPTIONS":
            # copy from allow
            response["Access-Control-Allow-Methods"] = response["Allow"]

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        self.add_cors_headers(response)
        return response


class ContentView(AllowCORSMixin, FormView):
    template_name = "secretgraph/content_form.html"
    action = "view"

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        response["X-HASH-ALGORITHMS"] = ",".join(
            settings.SECRETGRAPH_HASH_ALGORITHMS
        )
        response["X-GRAPHQL-PATH"] = resolve_url(
            getattr(settings, "SECRETGRAPH_GRAPHQL_PATH", "/graphql")
        )
        return response

    def get(self, request, *args, **kwargs):
        authset = set(
            request.headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.update(request.GET.getlist("token"))
        # authset can contain: ""
        # why not ids_to_results => uses flexid directly
        self.result = initializeCachedResult(request, authset=authset)[
            "Content"
        ]

        if "decrypt" in kwargs:
            if self.action != "view":
                raise Http404()
            response = self.handle_decrypt(request, authset, *args, **kwargs)
        if self.action in {"push", "update"}:
            # user interface
            response = self.render_to_response(self.get_context_data())
        else:
            # raw interface
            response = self.handle_raw_singlecontent(request, *args, **kwargs)
        return response

    def post(self, request, *args, **kwargs):
        authset = set(
            request.headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.update(request.GET.getlist("token"))
        # authset can contain: ""
        # why not ids_to_results => uses flexid directly
        self.result = retrieve_allowed_objects(
            request,
            Content.objects.filter(flexid=kwargs["id"]),
            scope=self.action,
            authset=authset,
        )
        return super().post(request, *args, **kwargs)

    def put(self, request, *args, **kwargs):
        # initialize POST dict also for PUT method
        # delete cache
        for attr in ("_post", "_files"):
            try:
                delattr(request, attr)
            except AttributeError:
                pass
        oldmethod = request.method
        request.method = "POST"
        # trigger cache
        request.POST
        # reset method
        request.method = oldmethod
        return super().put(request, *args, **kwargs)

    def get_form_class(self):
        if "prekey" in self.request.GET:
            return PreKeyForm
        elif self.request.method == "PUT" or "put" in self.request.GET:
            return UpdateForm
        else:
            return PushForm

    def get_form_kwargs(self):
        """Return the keyword arguments for instantiating the form."""
        kwargs = super().get_form_kwargs()
        if hasattr(self, "result"):
            try:
                content = ContentFetchQueryset(
                    fetch_by_id(self.result["objects"], kwargs["id"]).query,
                    self.result["actions"],
                ).first()
            finally:
                if not content:
                    raise Http404()
            kwargs.update(
                {
                    "result": self.result,
                    "instance": content,
                    "request": self.request,
                }
            )
        return kwargs

    def form_invalid(self, form):
        response = self.render_to_response(self.get_context_data(form=form))
        return response

    def form_valid(self, form):
        """If the form is valid, redirect to the supplied URL."""
        c, key = form.save()
        if key:
            response = HttpResponseRedirect(
                "%s?token=%s"
                % (
                    reverse(
                        "secretgraph:contents-update", kwargs={"id": c.id}
                    ),
                    "token=".join(
                        [
                            "%s:%s"
                            % (c.cluster.flexid, base64.b64encode(key)),
                            *self.result["authset"],
                        ]
                    ),
                )
            )
        else:
            response = HttpResponse(201)
        return response

    def handle_decrypt(self, request, id, *args, limit_ids=100, **kwargs):
        """
        space efficient join of one or more documents, decrypted
        In case of multiple documents the \\0 is escaped and the documents with
        \\0 joined

        Args:
            request ([type]): [description]

        Raises:
            Http404: [description]

        Returns:
            [type]: [description]

        Yields:
            chunks
        """
        # shallow copy initialization of result
        result = self.result.copy()
        result["objects"] = ContentFetchQueryset(
            fetch_by_id(result["objects"], id, limit_ids=limit_ids)
            .distinct()
            .query,
            result["actions"],
        )
        count = result["objects"].count()
        if not count:
            raise Http404()

        def gen():
            seperator = None
            for content in iter_decrypt_contents(result):
                if seperator is not None:
                    yield seperator
                if count == 1:
                    # don't alter document
                    for chunk in content.read_decrypt():
                        yield chunk
                else:
                    # seperate with \0
                    for chunk in content.read_decrypt():
                        yield chunk.replace(b"\0", b"\\0")
                seperator = b"\0"

        response = StreamingHttpResponse(gen())
        return response

    def handle_raw_singlecontent(self, request, *args, **kwargs):
        content = None
        result = self.result
        try:
            content = ContentFetchQueryset(
                fetch_by_id(result["objects"], kwargs["id"]).query,
                result["actions"],
            ).first()
        finally:
            if not content:
                raise Http404()
        if "keys" in request.GET:
            refs = content.references.select_related("target").filter(
                group__in=["key", "signature"]
            )
            q = Q(target__in=result["objects"])
            for k in request.GET.getlist("keys"):
                # digests have a length > 10
                if len(k) >= 10:
                    q |= Q(target__tags__tag=f"key_hash={k}")
            # signatures first, should be maximal 20, so on first page
            refs = (
                refs.filter(q)
                .annotate(
                    privkey_link=Subquery(
                        result["objects"]
                        .filter(
                            tags__tag="type=PrivateKey",
                            referencedBy__source__referencedBy=OuterRef("pk"),
                        )
                        .values("link")[:1]
                    )
                )
                .order_by("-group", "id")
            )
            page = Paginator(refs, 500).get_page(request.GET.get("page", 1))
            response = {
                "pages": page.paginator.num_pages,
                "signatures": {},
                "keys": {},
            }
            for ref in refs:
                if ref.group == "key":
                    response["keys"][ref.target.contentHash] = {
                        "key": ref.extra,
                        "link": ref.privkey_link and ref.privkey_link[0],
                    }
                else:
                    response["signatures"][ref.target.contentHash] = {
                        "signature": ref.extra,
                        "link": ref.target.link,
                    }
            response = JsonResponse(response)
            response["X-IS-SIGNED"] = "false"
        else:
            response = FileResponse(content.file.open("rb"))
            _type = content.tags.filter(tag__startswith="type=").first()
            response["X-TYPE"] = _type.tag.split("=", 1)[1] if _type else ""
            verifiers = content.references.filter(group="signature")
            response["X-IS-SIGNED"] = json.dumps(verifiers.exists())
        response["X-NONCE"] = content.nonce
        return response


class CORSFileUploadGraphQLView(AllowCORSMixin, FileUploadGraphQLView):
    def dispatch(self, request, *args, **kwargs):
        if settings.DEBUG and "operations" in request.POST:
            operations = json.loads(request.POST.get("operations", "{}"))
            logger.debug(
                "operations:\n%s\nmap:\n%s\nFILES:\n%s",
                pprint.pformat(operations),
                pprint.pformat(json.loads(request.POST.get("map", "{}"))),
                pprint.pformat(request.FILES),
            )
        return super().dispatch(request, *args, **kwargs)
