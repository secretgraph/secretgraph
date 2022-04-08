import base64
import logging
import os
from datetime import timedelta as td
from itertools import chain

import strawberry
from strawberry_django_plus import relay
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Subquery
from django.utils import timezone

from ....constants import MetadataOperations, TransferResult
from ...actions.update import (
    create_cluster_fn,
    create_content_fn,
    transfer_value,
    update_cluster_fn,
    update_content_fn,
    update_metadata_fn,
    manage_actions_fn,
)
from ...models import Cluster, Content, GlobalGroupProperty, GlobalGroup
from ...signals import generateFlexid
from ...utils.auth import (
    fetch_by_id,
    ids_to_results,
    initializeCachedResult,
    retrieve_allowed_objects,
    check_permission,
)
from ..arguments import (
    AuthList,
    ActionInput,
    ClusterInput,
    ContentInput,
    PushContentInput,
    ReferenceInput,
)
from ...utils.arguments import pre_clean_content_spec
from ..definitions import ClusterNode, ContentNode

logger = logging.getLogger(__name__)


@strawberry.type
class RegenerateFlexidMutation:
    class Input:
        ids: List[ID]
        authorization: Optional[AuthList]

    updated: List[ID]

    @classmethod
    def mutate_and_get_payload(cls, root, info, ids, authorization=None):
        manage = retrieve_allowed_objects(
            info.context,
            "manage",
            Cluster.objects.all(),
            authset=authorization,
        )
        if check_permission(info.context, "manage_update", manage["objects"]):
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
                updated.append(to_base64(type(obj).__name__, obj.flexid))
        return cls(updated=updated)


# only admin/moderator
class MarkMutation(relay.ClientIDMutation):
    class Input:
        ids: List[ID]
        authorization: Optional[AuthList]
        hidden = graphene.Boolean()
        featured = graphene.Boolean()

    markChanged: List[ID]

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, ids, hidden=None, featured=None, authorization=None
    ):
        manage = retrieve_allowed_objects(
            info.context,
            "manage",
            Cluster.objects.all(),
            authset=authorization,
        )
        if featured is not None:
            if not check_permission(
                info.context, "manage_featured", manage["objects"]
            ):
                featured = None
        if hidden is not None:
            if not check_permission(
                info.context, "manage_hidden", manage["objects"]
            ):
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
            markChanged=map(lambda x: to_base64("Content", x), contents)
        )


class MetadataUpdateMutation(relay.ClientIDMutation):
    class Input:
        ids: List[ID]
        authorization: Optional[AuthList]
        state: Optional[str]
        actions = graphene.List(graphene.NonNull(ActionInput), required=False)
        tags: Optional[List[str]]
        references = graphene.List(
            graphene.NonNull(ReferenceInput), required=False
        )
        operation = graphene.Enum.from_enum(MetadataOperations)

    updated: List[ID]

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        ids,
        state=None,
        tags=None,
        actions=None,
        operation=None,
        authorization=None,
        headers=None,
    ):

        manage = retrieve_allowed_objects(
            info.context,
            "manage",
            Cluster.objects.all(),
            authset=authorization,
        )
        if check_permission(info.context, "manage_update", manage["objects"]):
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
                contents.push(to_base64("Content", f().flexid))
        return cls(updated=contents)
