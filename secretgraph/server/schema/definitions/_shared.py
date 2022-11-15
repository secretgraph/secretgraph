from __future__ import annotations

from typing import Optional, List
import strawberry
from strawberry.types import Info
from strawberry_django_plus import gql
from django.db.models import Q

from ....core import constants
from ...utils.auth import get_cached_result
from ...models import Content


@strawberry.type
class ActionEntry:
    # of action key
    keyHash: str
    type: str
    allowedTags: Optional[List[str]]
    trustedKeys: List[str]


class ActionMixin:
    @gql.field()
    async def availableActions(self, info: Info) -> List[ActionEntry]:
        if getattr(self, "limited", False):
            return
        name = self.__class__.__name__.replace("Node", "", 1)
        results = get_cached_result(
            info.context.request, ensureInitialized=True
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
                    seen_ids.add(key_val[1])
                    yield ActionEntry(
                        keyHash=key_val[0][1],
                        type=key_val[0][0],
                        trustedKeys=(
                            results[name]["decrypted"][key_val[1]].get(
                                "trustedKeys"
                            )
                            or []
                        ),
                        allowedTags=(
                            results[name]["decrypted"][key_val[1]].get(
                                "allowedTags"
                            )
                            if key_val[0][0] not in {"view", "auth"}
                            else None
                        ),
                    )
        if has_manage:
            await results.preinit("Action")
            # use results["Action"] for ensuring exclusion of hidden actions
            # this is ensured by having manage in action set
            if isinstance(self, Content):
                async for action in (
                    results["Action"]["objects"]
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
                        trustedKeys=(
                            results[name]["decrypted"][key_val[1]].get(
                                "trustedKeys"
                            )
                            or []
                        ),
                        allowedTags=None,
                    )
            else:
                async for action in (
                    results["Action"]["objects"]
                    .filter(contentAction__isnull=True, cluster_id=self.id)
                    .exclude(id__in=seen_ids)
                ):
                    yield ActionEntry(
                        keyHash=action.keyHash,
                        type="other",
                        trustedKeys=(
                            results[name]["decrypted"][key_val[1]].get(
                                "trustedKeys"
                            )
                            or []
                        ),
                        allowedTags=None,
                    )

    @gql.field()
    @gql.django.django_resolver
    def authOk(self, info: Info) -> bool:
        name = self.__class__.__name__.replace("Node", "", 1)
        result = get_cached_result(
            info.context.request, ensureInitialized=True
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
