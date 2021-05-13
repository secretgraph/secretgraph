import base64
import logging
import os
import re
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
from ..models import Cluster, Content
from ..signals import generateFlexid
from ..utils.auth import (
    fetch_by_id,
    ids_to_results,
    initializeCachedResult,
    retrieve_allowed_objects,
)
from .arguments import (
    AuthList,
    ClusterInput,
    ContentInput,
    PushContentInput,
    ReferenceInput,
)
from .definitions import ClusterNode, ContentNode

logger = logging.getLogger(__name__)


class RegenerateFlexidMutation(relay.ClientIDMutation):
    class Input:
        ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        authorization = AuthList()

    updated = graphene.List(graphene.NonNull(graphene.ID))

    @classmethod
    def mutate_and_get_payload(cls, root, info, ids, authorization=None):
        results = ids_to_results(
            info.context,
            ids,
            (Content, Cluster),
            "update",
            authset=authorization,
        )
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
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

    latestDeletion = graphene.DateTime()

    @classmethod
    def mutate_and_get_payload(cls, root, info, ids, authorization=None):
        now = timezone.now()
        now_plus_x = now + td(minutes=20)
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    components = retrieve_allowed_objects(
        #        info, "manage", components
        #    )
        results = ids_to_results(
            info.context,
            ids,
            (Content, Cluster),
            "delete",
            authset=authorization,
        )
        results["Content"].objects.filter(
            Q(markForDestruction__isnull=True)
            | Q(markForDestruction__gt=now_plus_x)
        ).update(markForDestruction=now_plus_x)
        Content.objects.filter(
            Q(markForDestruction__isnull=True)
            | Q(markForDestruction__gt=now_plus_x),
            cluster_id__in=results["Cluster"].objects.values_list(
                "id", flat=True
            ),
        ).update(markForDestruction=now_plus_x)
        results["Cluster"].objects.filter(
            Q(markForDestruction__isnull=True) | Q(markForDestruction__gt=now)
        ).update(markForDestruction=now)
        calc_last = Content.objects.filter(
            Q(id__in=results["Content"].objects.values_list("id", flat=True))
            | Q(
                cluster_id__in=results["Cluster"].objects.values_list(
                    "id", flat=True
                )
            ),
            markForDestruction__isnull=False,
        ).latest("markForDestruction__gt")

        return cls(
            latestDeletion=calc_last.markForDestruction if calc_last else now
        )


class ResetDeletionContentOrClusterMutation(relay.ClientIDMutation):
    class Input:
        ids = graphene.List(graphene.NonNull(graphene.ID), required=True)
        authorization = AuthList()

    restored = graphene.List(graphene.NonNull(graphene.ID), required=False)

    @classmethod
    def mutate_and_get_payload(cls, root, info, ids, authorization=None):
        # TODO: admin permission
        # if not info.context.user.has_perm("TODO"):
        #    clusters = retrieve_allowed_objects(
        #        info, "manage", clusters
        #    )
        results = ids_to_results(
            info.context,
            ids,
            (Content, Cluster),
            "delete",
            authset=authorization,
        )
        contents = Content.objects.filter(
            Q(cluster_id__in=Subquery(results["Cluster"].objects.values("id")))
            | Q(id__in=Subquery(results["Content"].objects.values("id"))),
            markForDestruction__isnull=False,
        )
        contents.update(markForDestruction=None)
        clusters = Cluster.objects.filter(
            Q(id__in=Subquery(results["Cluster"].objects.values("id")))
            | Q(id__in=Subquery(contents.values("cluster_id"))),
            markForDestruction__isnull=False,
        )
        clusters.update(markForDestruction=None)
        return cls(
            restored=map(
                lambda x: to_global_id("Content", x),
                chain(
                    results["Content"].objects.filter(
                        id__in=Subquery(contents.values("id"))
                    ),
                    results["Cluster"].objects.filter(
                        id__in=Subquery(clusters.values("id"))
                    ),
                ),
            )
        )


class ClusterMutation(relay.ClientIDMutation):
    class Input:
        id = graphene.ID(required=False)
        updateId = graphene.ID(required=False)
        cluster = ClusterInput(required=False)
        authorization = AuthList()

    cluster = graphene.Field(ClusterNode)
    writeok = graphene.Boolean()

    @classmethod
    def mutate_and_get_payload(
        cls,
        root,
        info,
        id=None,
        updateId=None,
        cluster=None,
        authorization=None,
    ):
        if id:
            if not cluster:
                raise ValueError("no cluster update data")
            if not updateId:
                raise ValueError("updateId required")
            result = ids_to_results(
                info.context, id, Cluster, "manage", authset=authorization
            )["Cluster"]
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError()
            _cluster_res = update_cluster_fn(
                info.context,
                cluster_obj,
                cluster,
                updateId,
                authset=authorization,
            )(transaction.atomic)
        else:
            user = None
            manage = retrieve_allowed_objects(
                info.context,
                "manage",
                Cluster.objects.all(),
                authset=authorization,
            )["objects"].first()

            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if manage:
                    user = manage.user
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
    contentKey = graphene.String(required=False)
    writeok = graphene.Boolean()

    @classmethod
    def mutate_and_get_payload(
        cls, root, info, content, id=None, updateId=None, authorization=None
    ):
        required_keys = []
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
                    required_keys = Content.objects.injected_keys(
                        group=clusterObj.group if clusterObj else ""
                    )
                else:
                    required_keys = Content.objects.injected_keys(
                        group=content_obj.group
                    )
                required_keys = list(
                    required_keys.values_list("contentHash", flat=True)
                )

            requiredKeys = set()
            allowedTags = []
            injectedTags = []
            for action in result["actions"].filter(
                Q(contentAction__content_id=content_obj.id)
                | Q(contentAction__isnull=True),
                cluster_id=content_obj.cluster_id,
            ):
                form = result["forms"].get(action.id)
                if form:
                    requiredKeys.update(form.get("requiredKeys") or [])
                    # None should be possible here for not updating
                    if content.get("tags") is not None:
                        allowed = form.get("allowedTags", None)
                        if allowed is not None:
                            matcher = re.compile(
                                "^(?:%s)(?:(?<==)|$)"
                                % "|".join(map(re.escape, allowed))
                            )
                            allowedTags.append(matcher)
                        injectedTags = chain(
                            form.get("injectedTags", []), injectedTags
                        )

            def validTag(tag):
                for i in allowedTags:
                    if i.fullmatch(tag):
                        return True
                return False

            if content.get("tags") is not None:
                content["tags"] = chain(
                    filter(validTag, content["tags"]), injectedTags
                )
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
                required_keys = list(
                    Content.objects.injected_keys(
                        group=cluster_obj.group
                    ).values_list("contentHash", flat=True)
                )

            requiredKeys = set()
            allowedTags = []
            injectedTags = []
            for action in result["actions"].filter(
                Q(contentAction__isnull=True),
                cluster_id=cluster_obj.id,
            ):
                form = result["forms"].get(action.id)
                if form:
                    requiredKeys.update(form.get("requiredKeys") or [])
                    # None should be possible here for not updating
                    if content.get("tags") is not None:
                        allowed = form.get("allowedTags", None)
                        if allowed is not None:
                            matcher = re.compile(
                                "^(?:%s)(?:(?<==)|$)"
                                % "|".join(map(re.escape, allowed))
                            )
                            allowedTags.append(matcher)
                        injectedTags = chain(
                            form.get("injectedTags", []), injectedTags
                        )

            def validTag(tag):
                for i in allowedTags:
                    if i.fullmatch(tag):
                        return True
                return False

            if content.get("tags") is not None:
                content["tags"] = chain(
                    filter(validTag, content["tags"]), injectedTags
                )
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
    contentKey = graphene.String(required=False)
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
        form = result["forms"][
            result["actions"].get(contentAction__content_id=source.id).id
        ]
        if content.get("tags") is not None:
            allowed = form.get("allowedTags", None)
            if allowed is not None:
                matcher = re.compile(
                    "^(?:%s)(?:(?<==)|$)" % "|".join(map(re.escape, allowed))
                )
                content["tags"] = filter(
                    lambda x: matcher.fullmatch(x), content["tags"]
                )
            content["tags"] = chain(
                form.get("injectedTags", []), content["tags"]
            )
        else:
            content["tags"] = form.get("injectedTags") or []
        if content.get("references") is not None:
            content["references"] = chain(
                form.get("injectedReferences", []), content["references"]
            )
        else:
            content["references"] = form.get("injectedReferences") or []
        required_keys = list(
            Content.objects.injected_keys(group=source.group).values_list(
                "contentHash", flat=True
            )
        )
        required_keys.extend(form.get("requiredKeys", []))
        action_key = None
        if form.pop("updateable", False):
            freeze = form.pop("freeze", False)
            action_key = os.urandom(32)
            content["actions"] = [
                {
                    "key": action_key,
                    "action": "update",
                    "restrict": True,
                    "freeze": freeze,
                    "form": form,
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

        requiredKeys = set()
        for action in result["actions"].filter(
            Q(contentAction__content_id=content_obj.id)
            | Q(contentAction__isnull=True),
            cluster_id=content_obj.cluster_id,
        ):
            form = result["forms"].get(action.id)
            if form:
                requiredKeys.update(form.get("requiredKeys") or [])
        if not requiredKeys:
            verifiers = None
        else:
            verifiers = Content.objects.filter(
                id__in=requiredKeys, tags__tag="type=PublicKey"
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
        tags=None,
        operation=None,
        authorization=None,
        headers=None,
    ):
        result = ids_to_results(
            info.context, ids, Content, "update", authset=authorization
        )["Content"]
        requests = []
        for content_obj in result.objects.all():
            requests.append(
                update_metadata_fn(
                    info.context,
                    content_obj,
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
