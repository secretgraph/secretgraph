from typing import Iterable, Optional

import strawberry
import strawberry_django
from django.conf import settings
from strawberry.types import Info

from ...models import Content
from ...models import Key as _Key
from ...models import Signature as _Signature
from ...utils.auth import get_cached_result

Signature = strawberry.type(_Signature, name="Signature")
Key = strawberry.type(_Key, name="Key")


@strawberry_django.type(Content, name="ContentDownload")
class ContentDownloadNode(strawberry.relay.Node):
    link: str

    @classmethod
    async def resolve_nodes(
        cls,
        *,
        info: Info,
        node_ids: Iterable[str],
        required: bool = False,
    ):
        if not isinstance(node_ids, (tuple, list)):
            node_ids = list(node_ids)
        if len(node_ids) > settings.SECRETGRAPH_STRAWBERRY_MAX_RESULTS:
            raise ValueError("too many nodes requested")
        query = Content.objects.filter(downloadId__in=node_ids).filter(
            locked__isnull=True
        )
        querydict = {el.downloadId: el async for el in query}
        if required:
            return [querydict[nid] for nid in node_ids]
        else:
            return [querydict.get(nid) for nid in node_ids]

    @classmethod
    def resolve_id(
        cls,
        root: Content,
        *,
        info: Info,
    ) -> str:
        return root.downloadId

    @strawberry_django.field(description="retrieve signatures")
    def signatures(
        self: Content, info: Info, keyHashes: Optional[list[str]] = None
    ) -> Optional[list[Signature]]:
        if self.reduced:
            return None
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context["request"])["Content"]
        # we need to resolve in the sync context
        return [
            Signature(**i)
            for i in self.signatures(keyHashes, result["objects_with_public"])
        ]

    @strawberry_django.field(
        description="retrieve if permissed links to encrypted private key"
    )
    def keys(
        self: Content, info: Info, keyHashes: Optional[list[str]] = None
    ) -> Optional[list[Key]]:
        if self.reduced:
            return None
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context["request"])["Content"]
        # we need to resolve in the sync context
        return [
            Key(**i)
            for i in self.keys(keyHashes, result["objects_with_public"])
        ]
