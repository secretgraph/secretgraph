from typing import List, Optional
import logging

import strawberry
from strawberry.types import Info
from strawberry_django_plus import relay, gql
from django.db import transaction

from ....constants import MetadataOperations
from ...actions.update import (
    update_metadata_fn,
    manage_actions_fn,
)
from ...models import Cluster, Content
from ...signals import generateFlexid
from ...utils.auth import (
    fetch_by_id,
    ids_to_results,
    get_cached_permissions,
)
from ..arguments import (
    AuthList,
    ActionInput,
)

logger = logging.getLogger(__name__)


@strawberry.type
class RegenerateFlexidMutation:
    updated: List[relay.GlobalID]

    @gql.django.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
        info: Info,
        ids: List[relay.GlobalID],
        authorization: Optional[AuthList] = None,
    ):
        if get_cached_permissions(info.context, authset=authorization)[
            "manage_update"
        ]:
            results = {
                "Content": {
                    "objects": fetch_by_id(
                        Content.objects.all(), ids, limit_ids=None
                    )
                },
                "Cluster": {
                    "objects": fetch_by_id(
                        Cluster.objects.all(), ids, limit_ids=None
                    )
                },
            }
        else:
            results = ids_to_results(
                info.context,
                ids,
                (Content, Cluster),
                "update",
                authset=authorization,
            )
        updated = []
        for result in results.values():
            for obj in result["objects"]:
                generateFlexid(type(obj), obj, True)
                updated.append(relay.to_base64(type(obj).__name__, obj.flexid))
        return cls(updated=updated)


# only admin/moderator
@strawberry.type
class MarkMutation:

    markChanged: List[relay.GlobalID]

    @relay.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
        info,
        ids: List[relay.GlobalID],
        hidden: Optional[bool] = None,
        featured: Optional[bool] = None,
        authorization: Optional[AuthList] = None,
    ):
        if featured is not None:
            if not get_cached_permissions(info.context, authset=authorization)[
                "manage_featured"
            ]:
                featured = None
        if hidden is not None:
            if not get_cached_permissions(info.context, authset=authorization)[
                "manage_hidden"
            ]:
                hidden = None
        contents = Content.objects.none()
        clusters = Cluster.objects.none()
        if hidden is not None:
            contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)

            contents.update(hidden=hidden)
        if featured is not None:
            clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
            clusters.update(featured=featured)
        return cls(
            markChanged=map(lambda x: relay.to_base64("Content", x), contents)
        )


@strawberry.type
class MetadataUpdateMutation:

    updated: List[relay.GlobalID]

    @relay.input_mutation
    @classmethod
    def mutate_and_get_payload(
        cls,
        info: Info,
        ids: List[relay.GlobalID],
        state: Optional[str] = None,
        tags: Optional[List[str]] = None,
        actions: Optional[List[ActionInput]] = None,
        operation: Optional[MetadataOperations] = MetadataOperations.append,
        authorization: Optional[AuthList] = None,
    ):

        if get_cached_permissions(info.context, authset=authorization)[
            "manage_update"
        ]:
            contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
        else:
            result = ids_to_results(
                info.context, ids, Content, "update", authset=authorization
            )["Content"]
        requests = []
        for content_obj in result.objects.all():
            requests.append(
                update_metadata_fn(
                    info.context,
                    content_obj,
                    state=state,
                    tags=tags,
                    operation=operation,
                    authset=authorization,
                )
            )
            if actions:
                requests.append(
                    manage_actions_fn(
                        info.context,
                        content_obj,
                        actions,
                        authset=authorization,
                    )
                )
        contents = []
        with transaction.atomic():
            for f in requests:
                contents.push(relay.to_base64("Content", f().flexid))
        return cls(updated=contents)
