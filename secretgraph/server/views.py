import base64
import json
import logging


from urllib.parse import quote

from django.views.decorators.http import last_modified
from django.utils.decorators import method_decorator
from django.utils.cache import add_never_cache_headers
from django.conf import settings
from django.db.models import OuterRef, Q, Subquery
from django.db.models.functions import Substr
from django.http import (
    FileResponse,
    Http404,
    HttpResponse,
    HttpResponseRedirect,
    JsonResponse,
    StreamingHttpResponse,
)
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.views.generic.edit import FormView
from strawberry.django.views import AsyncGraphQLView

from .utils.mark import freeze_contents, update_file_accessed

from .forms import PreKeyForm, PushForm, UpdateForm
from .models import Content
from .utils.auth import (
    get_cached_result,
    retrieve_allowed_objects,
)
from .utils.encryption import iter_decrypt_contents
from .view_decorators import (
    no_opener,
    add_cors_headers,
    add_secretgraph_headers,
)
from ..core import constants

logger = logging.getLogger(__name__)


def calc_content_modified_raw(request, content, *args, **kwargs):
    if "key_hash" in request.GET or request.headers.get("X-KEY-HASH", ""):
        return None
    return content.updated


def calc_content_modified_decrypted(request, content, *args, **kwargs):
    if (
        not getattr(settings, "SECRETGRAPH_CACHE_DECRYPTED", False)
        and content.state not in constants.public_states
    ):
        return None
    return calc_content_modified_raw(request, content, *args, **kwargs)


class ContentView(FormView):
    template_name = "secretgraph/content_form.html"
    action = "view"

    @method_decorator(no_opener)
    @method_decorator(add_cors_headers)
    @method_decorator(add_secretgraph_headers)
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        authset = set(
            request.headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.update(request.GET.getlist("token"))
        # authset can contain: ""
        self.result = get_cached_result(request, authset=authset)["Content"]
        if request.GET.get("key") or request.headers.get("X-Key"):
            if self.action != "view":
                raise Http404()
            return self.handle_decrypt(
                request, authset=authset, *args, **kwargs
            )
        if self.action in {"push", "update"}:
            # user interface
            response = self.render_to_response(self.get_context_data())
        else:
            # raw interface
            content = get_object_or_404(
                self.result["objects"], downloadId=kwargs["id"]
            )
            response = self.handle_raw_singlecontent(
                request, content, *args, **kwargs
            )
        return response

    def post(self, request, *args, **kwargs):
        authset = set(
            request.headers.get("Authorization", "")
            .replace(" ", "")
            .split(",")
        )
        authset.update(request.GET.getlist("token"))
        authset.discard("")
        # authset can contain: ""
        # why not ids_to_results => uses flexid directly
        self.result = retrieve_allowed_objects(
            request,
            Content.objects.filter(downloadId=kwargs["id"]),
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
            content = get_object_or_404(
                self.result["objects"], downloadId=kwargs["id"]
            )
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

    def handle_decrypt(self, request, id, *args, **kwargs):
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
        if getattr(
            settings, "SECRETGRAPH_DISABLE_SERVERSIDE_DECRYPTION", False
        ):
            return HttpResponse(
                reason="Disabled functionality", status_code=503
            )

        # shallow copy initialization of result
        result = self.result.copy()
        result["objects"] = result["objects"].filter(downloadId=id).distinct()
        if not result["objects"].exists():
            raise Http404()

        decryptset = set(
            request.headers.get("X-Key", "").replace(" ", "").split(",")
        )
        decryptset.update(self.request.GET.getlist("key"))
        decryptset.discard("")
        try:
            iterator = iter_decrypt_contents(result, decryptset=decryptset)
            content = next(iterator)
        except StopIteration:
            return HttpResponse("Missing key", status=400)
        response = self.handle_decrypt_singlecontent(
            request, content, *args, **kwargs
        )
        if not getattr(
            settings, "SECRETGRAPH_CACHE_DECRYPTED", False
        ) and hasattr(content, "read_decrypt"):
            add_never_cache_headers(response)
        return response

    @method_decorator(last_modified(calc_content_modified_decrypted))
    def handle_decrypt_singlecontent(self, request, content, *args, **kwargs):
        freeze_contents([content.id], request)
        names = content.tags_proxy.name
        if hasattr(content, "read_decrypt"):
            response = StreamingHttpResponse(content.read_decrypt())
            if isinstance(names[0], str):
                # do it according to django
                try:
                    # check if ascii
                    names[0].encode("ascii")
                    header = 'attachment; filename="{}"'.format(
                        names[0].replace("\\", "\\\\").replace('"', r"\"")
                    )
                except UnicodeEncodeError:
                    header = "attachment; filename*=utf-8''{}".format(
                        quote(names[0])
                    )
                response["Content-Disposition"] = header
            response["X-Robots-Tag"] = "noindex,nofollow"
        else:
            response = FileResponse(content.file.read("rb"))
            if content.cluster.featured:
                response["X-Robots-Tag"] = "index,follow"
            else:
                response["X-Robots-Tag"] = "index,nofollow"

        update_file_accessed([content.id])
        response["X-TYPE"] = content.type
        return response

    @method_decorator(last_modified(calc_content_modified_raw))
    def handle_raw_singlecontent(self, request, content, *args, **kwargs):
        if "key_hash" in request.GET or request.headers.get("X-KEY-HASH", ""):
            keyhash_set = set(
                request.headers.get("X-KEY-HASH", "")
                .replace(" ", "")
                .split(",")
            )
            keyhash_set.update(request.GET.getlist("key_hash"))
            refs = content.references.select_related("target").filter(
                group__in=["key", "signature"]
            )
            # Public key in result set
            q = Q(target__in=self.result["objects"])
            for k in keyhash_set:
                q |= Q(target__tags__tag=f"key_hash={k}")
            # signatures first, should be maximal 20, so on first page
            refs = (
                refs.filter(q)
                .annotate(
                    privkey_downloadId=Subquery(
                        # private keys in result set, empty if no permission
                        self.result["objects"]
                        .filter(
                            type="PrivateKey",
                            references__target__referencedBy=OuterRef("pk"),
                        )
                        .values("downloadId")[:1]
                    )
                )
                .order_by("-group", "id")
            )
            response = {
                "signatures": {},
                "keys": {},
            }
            for ref in refs:
                if ref.group == "key":
                    response["keys"][
                        ref.target.contentHash.removeprefix("Key:")
                    ] = {
                        "key": ref.extra,
                        "link": (
                            ref.privkey_downloadId
                            and reverse(
                                "secretgraph:contents",
                                kwargs={"id": ref.privkey_downloadId},
                            )
                        )
                        or "",
                    }
                else:
                    response["signatures"][
                        ref.target.contentHash.removeprefix("Key:")
                    ] = {
                        "signature": ref.extra,
                        "link": ref.target.link,
                    }
            response = JsonResponse(response)
        else:
            try:
                name = content.tags.filter(tag__startswith="name=").first()
                if name:
                    name = name.tag.split("=", 1)[-1]
                response = FileResponse(
                    content.file.open("rb"),
                    as_attachment=bool(name),
                    filename=name,
                )
                update_file_accessed([content.id])
            except FileNotFoundError as e:
                raise Http404() from e
        freeze_contents([content.id], self.request)
        response["X-TYPE"] = content.type
        verifiers = content.references.filter(group="signature")
        response["X-IS-SIGNED"] = json.dumps(verifiers.exists())
        response["X-NONCE"] = content.nonce
        response["X-Robots-Tag"] = "noindex,nofollow"
        if content.type == "PrivateKey":
            response["X-KEY"] = ",".join(
                content.tags.filter(tag__startswith="key=")
                .annotate(raw_key=Substr("tag", 5))
                .values_list("raw_key", flat=True)
            )
        return response


class CORSFileUploadGraphQLView(AsyncGraphQLView):
    @method_decorator(add_cors_headers)
    async def dispatch(self, request, *args, **kwargs):
        # if settings.DEBUG and "operations" in request.POST:
        #     operations = json.loads(request.POST.get("operations", "{}"))
        #     logger.debug(
        #            "operations:\n%s\nmap:\n%s\nFILES:\n%s",
        #            pprint.pformat(operations),
        #            pprint.pformat(json.loads(request.POST.get("map", "{}"))),
        #            pprint.pformat(request.FILES),
        #     )
        return await super().dispatch(request, *args, **kwargs)
