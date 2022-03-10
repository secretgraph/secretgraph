import base64
import logging
import os
from datetime import timedelta as td
from itertools import chain

import graphene
from graphql_relay import to_global_id
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Subquery
from django.utils import timezone
from graphene import relay

from ...constants import MetadataOperations, TransferResult
from ..actions.update import (
    create_cluster_fn,
    create_content_fn,
    transfer_value,
    update_cluster_fn,
    update_content_fn,
    update_metadata_fn,
)
from ..models import Cluster, Content, GlobalGroupProperty, GlobalGroup
from ..signals import generateFlexid
from ..utils.auth import (
    fetch_by_id,
    ids_to_results,
    initializeCachedResult,
    retrieve_allowed_objects,
    check_permission,
)
from .arguments import (
    AuthList,
    ClusterInput,
    ContentInput,
    PushContentInput,
    ReferenceInput,
)
from ..utils.arguments import pre_clean_content_spec
from .definitions import ClusterNode, ContentNode

logger = logging.getLogger(__name__)


class RegenerateFlexidMutation(relay.ClientIDMutation):
    class Input:
        ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        authorization = AuthList()

    updated = graphene.List(graphene.NonNull(graphene.ID))

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
                updated.append(to_global_id(type(obj).__name__, obj.flexid))
        return cls(updated=updated)


class DeleteContentOrClusterMutation(relay.ClientIDMutation):
    class Input:
        ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        authorization = AuthList()
        when = graphene.DateTime()

    latestDeletion = graphene.DateTime()

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, ids, when=None, authorization=None
    ):
        now = timezone.now()

        manage = retrieve_allowed_objects(
            info.context,
            "manage",
            Cluster.objects.all(),
            authset=authorization,
        )
        if check_permission(
            info.context, "manage_deletion", manage["objects"]
        ):
            contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
            clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
        else:
            results = ids_to_results(
                info.context,
                ids,
                (Content, Cluster),
                "delete",
                authset=authorization,
            )
            contents = results["Content"]["objects"]
            clusters = results["Cluster"]["objects"]
        if when:
            when_x = max(now + td(minutes=20), when)
            contents.update(markForDestruction=when_x)
            Content.objects.filter(
                cluster_id__in=Subquery(clusters.values("id"))
            ).update(markForDestruction=when_x)
            clusters.update(markForDestruction=when)
        else:
            now_plus_x = now + td(minutes=20)
            contents.filter(
                Q(markForDestruction__isnull=True)
                | Q(markForDestruction__gt=now_plus_x)
            ).update(markForDestruction=now_plus_x)
            Content.objects.filter(
                Q(markForDestruction__isnull=True)
                | Q(markForDestruction__gt=now_plus_x),
                cluster_id__in=Subquery(clusters.values("id")),
            ).update(markForDestruction=now_plus_x)
            clusters.filter(
                Q(markForDestruction__isnull=True)
                | Q(markForDestruction__gt=now)
            ).update(markForDestruction=now)
        calc_last = Content.objects.filter(
            Q(id__in=Subquery(contents.values("id")))
            | Q(cluster_id__in=Subquery(clusters.values("id"))),
            markForDestruction__isnull=False,
        ).latest("markForDestruction")

        return cls(
            latestDeletion=calc_last.markForDestruction if calc_last else None
        )


class ResetDeletionContentOrClusterMutation(relay.ClientIDMutation):
    class Input:
        ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        authorization = AuthList()

    restored = graphene.List(graphene.NonNull(graphene.ID), required=False)

    @classmethod
    def mutate_and_get_payload(cls, root, info, ids, authorization=None):
        manage = retrieve_allowed_objects(
            info.context,
            "manage",
            Cluster.objects.all(),
            authset=authorization,
        )
        if check_permission(
            info.context, "manage_deletion", manage["objects"]
        ):
            contents = fetch_by_id(Content.objects.all(), ids, limit_ids=None)
            clusters = fetch_by_id(Cluster.objects.all(), ids, limit_ids=None)
        else:
            results = ids_to_results(
                info.context,
                ids,
                (Content, Cluster),
                "delete",
                authset=authorization,
            )
            contents = results["Content"]["objects"]
            clusters = results["Cluster"]["objects"]
        contents = Content.objects.filter(
            Q(cluster_id__in=Subquery(clusters.values("id")))
            | Q(id__in=Subquery(contents.values("id"))),
            markForDestruction__isnull=False,
        )
        contents.update(markForDestruction=None)
        clusters = Cluster.objects.filter(
            Q(id__in=Subquery(clusters.values("id")))
            | Q(id__in=Subquery(contents.values("cluster_id"))),
            markForDestruction__isnull=False,
        )
        clusters.update(markForDestruction=None)
        return cls(
            restored=map(
                lambda x: to_global_id(type(x).__name__, x.flexid),
                chain(
                    contents.filter(id__in=Subquery(contents.values("id"))),
                    clusters.filter(id__in=Subquery(clusters.values("id"))),
                ),
            )
        )


# only admin/moderator
class MarkMutation(relay.ClientIDMutation):
    class Input:
        ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        authorization = AuthList()
        hidden = graphene.Boolean()
        featured = graphene.Boolean()

    markChanged = graphene.List(graphene.NonNull(graphene.ID), required=False)

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
            markChanged=map(lambda x: to_global_id("Content", x), contents)
        )


class ClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        updateId = graphene.ID(required=False)
        cluster = ClusterInput(required=True)
        authorization = AuthList()

    cluster = graphene.Field(ClusterNode)
    writeok = graphene.Boolean()

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        cluster,
        id=None,
        updateId=None,
        authorization=None,
    ):
        manage = retrieve_allowed_objects(
            info.context,
            "manage",
            Cluster.objects.all(),
            authset=authorization,
        )
        if cluster.get("featured") is not None:
            if not check_permission(
                info.context, "manage_featured", manage["objects"]
            ):
                del cluster["featured"]

        if cluster.get("groups") is not None:
            if check_permission(
                info.context, "manage_groups", manage["objects"]
            ):
                cluster["groups"] = GlobalGroup.objects.filter(
                    name__in=cluster["groups"]
                )
            else:
                del cluster["groups"]
        if id:
            if not updateId:
                raise ValueError("updateId required")
            result = ids_to_results(
                info.context, id, Cluster, "update", authset=authorization
            )["Cluster"]
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError("No cluster found")
            _cluster_res = update_cluster_fn(
                info.context,
                cluster_obj,
                cluster,
                updateId,
                authset=authorization,
            )(transaction.atomic)
        else:
            user = None
            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if manage:
                    user = manage.first().user
                if not user:
                    user = getattr(info.context, "user", None)
                if not user or not user.is_authenticated:
                    raise ValueError("Must be logged in")
            elif (
                getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False)
                == "cluster"
                and not manage.exist()
            ):
                raise ValueError("Cannot register new cluster")
            elif (
                getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False)
                is not True
            ):
                raise ValueError("Cannot register new cluster")
            cluster["groups"] = GlobalGroupProperty.objects.get_or_create(
                name="default", defaults={}
            )[0].groups.all()
            _cluster_res = create_cluster_fn(
                info.context, cluster, user=user, authset=authorization
            )(transaction.atomic)
        initializeCachedResult(info.context, authset=authorization)
        return cls(**_cluster_res)


class ContentMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        content = graphene.Field(ContentInput, required=True)
        updateId = graphene.ID(required=False)
        authorization = AuthList()

    content = graphene.Field(ContentNode)
    writeok = graphene.Boolean()

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, content, id=None, updateId=None, authorization=None
    ):
        required_keys = set()
        if id:
            if not updateId:
                raise ValueError("updateId required")
            result = ids_to_results(
                info.context, id, Content, "update", authset=authorization
            )["Content"]
            content_obj = result["objects"].first()
            if not content_obj:
                raise ValueError()

            if content.value:
                if content.cluster:
                    clusterObj = fetch_by_id(
                        Cluster.objects.all(), [content.cluster]
                    ).first()
                    if clusterObj:
                        required_keys = Content.objects.required_keys_full(
                            clusterObj
                        )
                    else:
                        raise ValueError("cluster not found")
                else:
                    required_keys = Content.objects.required_keys_full(
                        clusterObj
                    )
                required_keys = set(
                    required_keys.values_list("contentHash", flat=True)
                )
            pre_clean_content_spec(True, content, result)

            returnval = cls(
                **update_content_fn(
                    info.context,
                    content_obj,
                    content,
                    updateId=updateId,
                    required_keys=required_keys,
                    authset=authorization,
                )(transaction.atomic)
            )
        else:
            result = ids_to_results(
                info.context,
                content.cluster,
                Cluster,
                "create",
                authset=authorization,
            )["Cluster"]
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError("Cluster for Content not found")

            # is a key spec
            if not content.key:
                required_keys = set(
                    Content.objects.required_keys_full(
                        cluster_obj
                    ).values_list("contentHash", flat=True)
                )
            pre_clean_content_spec(content, content, result)

            returnval = cls(
                **create_content_fn(
                    info.context,
                    content,
                    required_keys=required_keys,
                    authset=authorization,
                )(transaction.atomic)
            )
        initializeCachedResult(info.context, authset=authorization)
        return returnval


class PushContentMutation(relay.ClientIDMutation):
    class Input:
        content = graphene.Field(PushContentInput, required=True)
        authorization = AuthList()

    content = graphene.Field(ContentNode)
    actionKey = graphene.String(required=False)

    @classmethod
    def mutate_and_get_payload(cls, root, info, content, authorization=None):
        parent_id = content.pop("parent")
        result = ids_to_results(
            info.context, parent_id, Content, "push", authset=authorization
        )["Content"]
        source = result["objects"].first()
        if not source:
            raise ValueError("Content not found")
        res = pre_clean_content_spec(True, content, result)
        required_keys = set(
            Content.objects.required_keys_full(source.cluster).values_list(
                "contentHash", flat=True
            )
        )
        action_key = None
        if res["updateable"]:
            action_key = os.urandom(32)
            content["actions"] = [
                {
                    "key": action_key,
                    "action": "update",
                    "restrict": True,
                    "freeze": res["freeze"],
                }
            ]
        c = create_content_fn(
            info.context,
            content,
            required_keys=required_keys,
            authset=authorization,
        )(transaction.atomic)
        initializeCachedResult(info.context, authset=authorization)
        return cls(
            content=c, actionKey=base64.b64encode(action_key).decode("ascii")
        )


class TransferMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=True)
        url = graphene.String(required=False)
        key = graphene.String(required=False, description="Transfer Key")
        headers = graphene.JSONString(required=False)
        authorization = AuthList()

    content = graphene.Field(ContentNode, required=False)

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        id,
        url=None,
        key=None,
        authorization=None,
        headers=None,
    ):
        result = ids_to_results(
            info.context, id, Content, "update", authset=authorization
        )["Content"]
        content_obj = result.objects.first()
        if not content_obj:
            raise ValueError()
        if key and url:
            raise ValueError()

        trustedKeys = set()
        for action_id in result["active_actions"]:
            action_dict = result["decrypted"][action_id]
            trustedKeys.update(action_dict.get("trustedKeys"))
        verifiers = Content.objects.filter(
            contentHash__in=trustedKeys, type="PublicKey"
        )

        tres = transfer_value(
            content_obj, key=key, url=url, headers=headers, verifiers=verifiers
        )

        if tres in {
            TransferResult.NOTFOUND,
            TransferResult.FAILED_VERIFICATION,
        }:
            content_obj.delete()
        elif result == TransferResult.SUCCESS:
            return cls(content=content_obj)
        return cls(content=None)


class MetadataUpdateMutation(relay.ClientIDMutation):
    class Input:
        ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        authorization = AuthList()
        state = graphene.String(required=False)
        tags = graphene.List(graphene.NonNull(graphene.String), required=False)
        references = graphene.List(
            graphene.NonNull(ReferenceInput), required=False
        )
        operation = graphene.Enum.from_enum(MetadataOperations)

    updated = graphene.List(graphene.NonNull(graphene.ID), required=False)

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        ids,
        state=None,
        tags=None,
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
        contents = []
        with transaction.atomic():
            for f in requests:
                contents.push(to_global_id("Content", f().flexid))
        return cls(updated=contents)
