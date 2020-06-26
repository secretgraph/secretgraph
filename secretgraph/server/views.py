import json

from django.conf import settings
from django.core.paginator import Paginator
from django.db.models import OuterRef, Q, Subquery
from django.http import (
    FileResponse, Http404, JsonResponse, StreamingHttpResponse
)
from django.views.generic import View
from django.views.generic.edit import UpdateView
from graphene_file_upload.django import FileUploadGraphQLView

from ..utils.auth import fetch_by_id, initializeCachedResult
from ..utils.encryption import iter_decrypt_contents
from .actions.view import fetch_clusters, fetch_contents
from .forms import PushForm, UpdateForm


class AllowCORSMixin(object):

    def add_cors_headers(self, response):
        response["Access-Control-Allow-Origin"] = "*"
        if self.request.method == "OPTIONS":
            # copy from allow
            response["Access-Control-Allow-Methods"] = response['Allow']

    def dispatch(self, request, *args, **kwargs):
        response = super().dispatch(request, *args, **kwargs)
        self.add_cors_headers(response)
        return response


class ClustersView(View):

    def get(self, request, *args, **kwargs):
        # for authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        clusters = fetch_clusters(
            initializeCachedResult(
                request, authset=authset
            )["Cluster"]["objects"],
            kwargs.get("id"),
            info_include=request.GET.getlist("inclInfo"),
            info_exclude=request.GET.getlist("exclInfo"),
            content_hashes=request.GET.getlist("contentHash")
        )
        if not clusters:
            raise Http404()

        if kwargs.get("id"):
            cluster = clusters[0]
            response = FileResponse(
                cluster.publicInfo
            )
        else:
            page = Paginator(clusters.order_by("id"), 1000).get_page(
                request.GET.get("page", 1)
            )
            response = JsonResponse({
                "pages": page.paginator.num_pages,
                "clusters": [c.flexid for c in page]
            })

        return response


class DocumentsView(View):

    def get(self, request, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        # shallow copy initialization of result
        result = initializeCachedResult(
            request, authset=authset
        )["Content"].copy()
        result["objects"] = fetch_contents(
            result["objects"],
            result["actions"],
            kwargs.get("id"),
            info_include=request.GET.getlist("inclInfo"),
            info_exclude=request.GET.getlist("exclInfo"),
            content_hashes=request.GET.getlist("contentHash")
        )
        if not result["objects"]:
            raise Http404()

        def gen():
            seperator = b""
            for document in iter_decrypt_contents(
                result, authset
            ):
                yield seperator
                if kwargs.get("id"):
                    # don't alter document
                    for chunk in document:
                        yield chunk
                else:
                    # seperate with \0
                    for chunk in document:
                        yield chunk.replace(b"\0", b"\\0")
                seperator = b"\0"

        return StreamingHttpResponse(gen())


class RawView(View):
    def handle_content(self, request, result, *args, **kwargs):
        content = None
        try:
            content = fetch_by_id(
                result["objects"], kwargs["id"]
            ).first()
        finally:
            if not content:
                raise Http404()
        if "keys" in request.GET:
            refs = content.references.select_related("target").filter(
                group__in=["key", "signature"]
            )
            q = Q()
            for k in request.GET.getlist("keys"):
                # digests have a length > 10
                if len(k) >= 10:
                    q |= Q(target__info__tag=f"key_hash={k}")
            # signatures first, should be maximal 20, so on first page
            refs = refs.filter(q).order_by("-group", "id")
            page = Paginator(refs, 1000).get_page(
                request.GET.get("page", 1)
            )
            response = JsonResponse({
                "pages": page.paginator.num_pages,
                "signatures": {
                    ref.target.contentHash: {
                        "signature": ref.extra,
                        "link": ref.target.link
                    }
                    for ref in page.filter(
                        group="signature",
                        target__in=result["objects"]
                    )
                },
                "keys": {
                    ref.target.contentHash: {
                        "key": ref.extra,
                        "link": ref.privkey_link and ref.privkey_link[0]
                    }
                    for ref in page.filter(
                        group="key",
                        target__in=result["objects"]
                    ).annotate(
                        privkey_link=Subquery(
                            result["objects"].filter(
                                info__tag="type=PrivateKey",
                                referencedBy__source__referencedBy=OuterRef("pk")  # noqa: E501
                            ).values("link")[:1]
                        )
                    )
                }
            })
            response["X-IS-VERIFIED"] = "false"
        else:
            response = FileResponse(content.value.open("rb"))
            _type = content.info.filter(tag__startswith="type=").first()
            response["X-TYPE"] = _type.split("=", 1)[1] if _type else ""
            verifiers = content.references.filter(
                group="signature"
            )
            response["X-IS-VERIFIED"] = json.dumps(verifiers.exists())
        response["X-NONCE"] = content.nonce

        return response

    def get(self, request, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))
        result = initializeCachedResult(
            request, authset=authset
        )["Content"]
        # if kwargs.get("id"):
        response = self.handle_content(request, result, *args, **kwargs)
        # else:
        #    response = self.handle_links(request, result, *args, **kwargs)

        response["X-ITERATIONS"] = ",".join(
            settings.SECRETGRAPH_ITERATIONS
        )
        response["X-HASH-ALGORITHMS"] = ",".join(
            settings.SECRETGRAPH_HASH_ALGORITHMS
        )
        return response


class PushView(AllowCORSMixin, UpdateView):
    form_class = PushForm

    def post(self, request, id, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))


class UpdateView(AllowCORSMixin, UpdateView):
    form_class = UpdateForm

    def post(self, request, id, *args, **kwargs):
        # for decryptset and authset
        authset = set(request.headers.get("Authorization", "").replace(
            " ", ""
        ).split(","))
        authset.update(request.GET.getlist("token"))


class CORSFileUploadGraphQLView(AllowCORSMixin, FileUploadGraphQLView):
    pass
