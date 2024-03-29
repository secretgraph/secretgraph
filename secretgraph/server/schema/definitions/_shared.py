import logging
from datetime import datetime
from typing import Optional, Union
from uuid import UUID

import strawberry
import strawberry_django
from django.db.models import Q
from strawberry.types import Info

from ....core import constants
from ...models import Cluster, Content
from ...utils.auth import (
    ain_cached_net_properties_or_user_special,
    get_cached_result,
    retrieve_allowed_objects,
)


@strawberry.type
class Language:
    code: str
    name: str


@strawberry.type
class ActionEntry:
    # of action key
    keyHash: str
    type: str
    allowedTags: Optional[list[str]]


@strawberry.type
class SGAuthResult:
    requester: str
    challenge: str
    signatures: list[str]


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
        # e.g. via node direct
        results = get_cached_result(info.context["request"], ensureInitialized=False)
        main_result = await results.aat(name)
        # only show some actions if not set
        has_manage_or_admin = False
        if isinstance(self, Content):
            # if content: check cluster and content keys
            mappers = [
                main_result.get("action_info_contents", {}).get(self.id, {}),
                main_result.get("action_info_clusters", {}).get(self.cluster_id, {}),
            ]
        else:
            mappers = [main_result.get("action_info_clusters", {}).get(self.id, {})]
        # auth included unprotected ids
        seen_ids = set()
        # prevent copy
        for mapper in mappers:
            for key_val in mapper.items():
                if key_val[0][0] in {"manage", "admin"}:
                    has_manage_or_admin = True
                # auth is protected so it...
                if key_val[0][0] not in constants.protectedActions:
                    seen_ids.update(key_val[1])
                    allowedTags = None
                    # ...doesn't appear here
                    if key_val[0][0] != "view":
                        for action_id in key_val[1]:
                            _tags = main_result["action_results"][action_id].get(
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
        if has_manage_or_admin:
            action_result = await results.aat("Action")
            # use results["Action"] for ensuring exclusion of hidden actions
            # this is ensured by having manage in action set
            if isinstance(self, Content):
                # is currently the same as without_public for Actions
                async for action in (
                    action_result["objects_with_public"]
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
                    action_result["objects_with_public"]
                    .filter(contentAction__isnull=True, cluster_id=self.id)
                    .exclude(id__in=seen_ids)
                ):
                    yield ActionEntry(
                        keyHash=action.keyHash,
                        type="other",
                        allowedTags=None,
                    )

    @strawberry_django.field()
    async def auth(self: Union[Content, Cluster], info: Info) -> Optional[SGAuthResult]:
        if self.limited or self.reduced:
            return None
        # e.g. via node direct
        viewresult = get_cached_result(info.context["request"], ensureInitialized=False)
        if isinstance(self, Content):
            result = await retrieve_allowed_objects(
                info.context["request"],
                Content.objects.filter(id=self.id, markForDestruction__isnull=True),
                scope="auth",
                authset=viewresult.authset,
            )
            # if content: check cluster and content keys
            mappers = [
                result.get("action_info_contents", {}).get(self.id, {}),
                result.get("action_info_clusters", {}).get(self.cluster_id, {}),
            ]
        else:
            result = await retrieve_allowed_objects(
                info.context["request"],
                Cluster.objects.filter(id=self.id, markForDestruction__isnull=True),
                scope="auth",
                authset=viewresult.authset,
            )
            mappers = [result.get("action_info_clusters", {}).get(self.id, {})]
        authResult = None
        for mapper in mappers:
            for key_val in mapper.items():
                # use first auth token match
                if key_val[0][0] == "auth":
                    # in multiple steps using the same token for auth
                    # it is possible to create exactly this scenario
                    if len(key_val[1]) != 1:
                        logging.warning(
                            "multiple auth actions for one token specified, use the first ignore the rest"
                        )
                    authResult = SGAuthResult(
                        requester=result["action_results"][key_val[1][0]]["requester"],
                        challenge=result["action_results"][key_val[1][0]]["challenge"],
                        signatures=result["action_results"][key_val[1][0]][
                            "signatures"
                        ],
                    )
                    break
            if authResult:
                break
        return authResult

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
    async def properties(self: Union[Content, Cluster], info: Info) -> list[str]:
        if self.limited or self.reduced:
            return []
        if await ain_cached_net_properties_or_user_special(
            info.context["request"], "allow_hidden"
        ):
            return [
                name async for name in self.properties.values_list("name", flat=True)
            ]
        else:
            return [
                name
                async for name in self.nonhidden_properties.values_list(
                    "name", flat=True
                )
            ]
