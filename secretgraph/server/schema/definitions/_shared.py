from datetime import datetime
from typing import Optional, Union
from uuid import UUID

import strawberry
import strawberry_django
from django.db.models import Q
from strawberry.types import Info

from ....core import constants
from ...models import Cluster, Content
from ...utils.auth import get_cached_net_properties, get_cached_result


@strawberry.type
class ActionEntry:
    # of action key
    keyHash: str
    type: str
    allowedTags: Optional[list[str]]


@strawberry.type
class SBaseTypesMixin:
    limited: strawberry.Private[bool] = False
    reduced: strawberry.Private[bool] = False

    @strawberry_django.field()
    async def availableActions(
        self: Union[Content, Cluster], info: Info
    ) -> list[ActionEntry]:
        if self.limited or self.reduced:
            return
        name = self.__class__.__name__.replace("Node", "", 1)
        results = get_cached_result(
            info.context["request"], ensureInitialized=True
        )
        # only show some actions if not set
        has_manage = False
        if isinstance(self, Content):
            # if content: check cluster and content keys
            mappers = [
                results[name].get("action_info_contents", {}).get(self.id, {}),
                results[name]
                .get("action_info_clusters", {})
                .get(self.cluster_id, {}),
            ]
        else:
            mappers = [
                results[name].get("action_info_clusters", {}).get(self.id, {})
            ]
        # auth included unprotected ids
        seen_ids = set()
        # prevent copy
        for mapper in mappers:
            for key_val in mapper.items():
                if key_val[0][0] == "manage":
                    has_manage = True
                if key_val[0][0] not in constants.protectedActions:
                    seen_ids.update(key_val[1])
                    allowedTags = None
                    if key_val[0][0] not in {"view", "auth"}:
                        for action_id in key_val[1]:
                            _tags = results[name]["decrypted"][action_id].get(
                                "allowedTags"
                            )
                            if _tags is not None:
                                if allowedTags is None:
                                    allowedTags = list()
                                allowedTags.extend(_tags)

                    yield ActionEntry(
                        keyHash=key_val[0][1],
                        type=key_val[0][0],
                        allowedTags=allowedTags,
                    )
        if has_manage:
            await results.preinit("Action")
            # use results["Action"] for ensuring exclusion of hidden actions
            # this is ensured by having manage in action set
            if isinstance(self, Content):
                # is currently the same as without_public for Actions
                async for action in (
                    results["Action"]["objects_with_public"]
                    .filter(
                        Q(contentAction__isnull=True)
                        | Q(contentAction__content_id=self.id),
                        cluster_id=self.cluster_id,
                    )
                    .exclude(id__in=seen_ids)
                ):
                    yield ActionEntry(
                        keyHash=action.keyHash,
                        type="other",
                        allowedTags=None,
                    )
            else:
                # is currently the same as without_public for Actions
                async for action in (
                    results["Action"]["objects_with_public"]
                    .filter(contentAction__isnull=True, cluster_id=self.id)
                    .exclude(id__in=seen_ids)
                ):
                    yield ActionEntry(
                        keyHash=action.keyHash,
                        type="other",
                        allowedTags=None,
                    )

    @strawberry_django.field()
    def authOk(self: Union[Content, Cluster], info: Info) -> Optional[bool]:
        if self.limited or self.reduced:
            return None
        name = self.__class__.__name__.replace("Node", "", 1)
        result = get_cached_result(
            info.context["request"], ensureInitialized=True
        )[name]
        authOk = False
        if isinstance(self, Content):
            # if content: check cluster and content keys
            mappers = [
                result.get("action_info_contents", {}).get(self.id, {}),
                result.get("action_info_clusters", {}).get(
                    self.cluster_id, {}
                ),
            ]
        else:
            mappers = [result.get("action_info_clusters", {}).get(self.id, {})]
        for mapper in mappers:
            for key_val in mapper.items():
                if key_val[0][0] == "auth":
                    authOk = True
                    break
            if authOk:
                break
        return authOk

    @strawberry_django.field()
    def updated(self: Union[Content, Cluster]) -> Optional[datetime]:
        if self.limited:
            return None
        return self.updated

    @strawberry_django.field()
    def updateId(self: Union[Content, Cluster]) -> Optional[UUID]:
        if self.limited:
            return None
        return self.updateId

    @strawberry_django.field()
    def deleted(self: Union[Content, Cluster]) -> Optional[datetime]:
        if self.limited:
            return None
        return self.markForDestruction

    @strawberry_django.field()
    def properties(self: Union[Content, Cluster], info: Info) -> list[str]:
        if self.limited or self.reduced:
            return []
        if "allow_hidden" in get_cached_net_properties(
            info.context["request"]
        ):
            return list(self.properties)
        else:
            return list(self.nonhidden_properties)
