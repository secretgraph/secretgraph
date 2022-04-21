from __future__ import annotations
from typing import Optional, Union, List, Annotated
from datetime import datetime
import strawberry
from strawberry.types import Info
from uuid import UUID
from strawberry_django_plus import relay, gql
from django.db.models import Subquery, Q
from django.conf import settings
from django.shortcuts import resolve_url

from ... import constants
from ..utils.auth import get_cached_result, fetch_by_id
from ..actions.view import fetch_clusters, fetch_contents
from ..models import (
    Action,
    Cluster,
    Content,
    ContentReference,
    GlobalGroup,
    GlobalGroupProperty,
)
from .shared import DeleteRecursive, UseCriteria, UseCriteriaPublic


# why?: scalars cannot be used in Unions


@strawberry.scalar
class RegisterUrl:
    """
    The `RegisterUrl` scalar type represents can be:
    *  String: url,
    *  Boolean: can register/cannot register at all.
    """


@gql.django.type(Content, name="InjectedKey")
class InjectedKeyNode(relay.Node):

    link: str
    hash: str = gql.django.field(field_name="contentHash")

    @classmethod
    def resolve_id(cls, root) -> str:
        return root.flexid


@gql.django.type(GlobalGroupProperty, name="GlobalGroupProperty")
class GlobalGroupPropertyNode(relay.Node):
    name: gql.auto
    description: gql.auto


@gql.django.type(GlobalGroup, name="GlobalGroup")
class GlobalGroupNode(relay.Node):

    name: gql.auto
    description: gql.auto
    hidden: gql.auto
    matchUserGroup: gql.auto
    clusters: gql.auto
    injected_keys: gql.auto

    @gql.django.field(only=["properties"])
    def properties(self) -> List[str]:
        return self.properties.values_list("name", flat=True)


@gql.type()
class SecretgraphConfig(relay.Node):
    groups: List[GlobalGroupNode] = gql.django.field()

    @classmethod
    def resolve_id(cls) -> str:
        return getattr(settings, "LAST_CONFIG_RELOAD_ID", "")

    @classmethod
    def resolve_node(
        cls, *, info: Optional[Info] = None, node_id: str, required: bool
    ) -> SecretgraphConfig:
        return cls()

    @strawberry.field
    @staticmethod
    def hashAlgorithms() -> List[str]:
        return settings.SECRETGRAPH_HASH_ALGORITHMS

    @strawberry.field
    @staticmethod
    def registerUrl() -> RegisterUrl:
        if getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False) is not True:
            return False
        signup_url = getattr(settings, "SIGNUP_URL", None)
        if (
            getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
            and not signup_url
        ):
            return False
        if signup_url:
            return resolve_url(signup_url)
        return True

    @strawberry.field
    @staticmethod
    def loginUrl() -> Optional[str]:
        login_url = getattr(settings, "LOGIN_URL", None)
        if login_url:
            return resolve_url(login_url)
        return None


@strawberry.type
class ActionEntry:
    # of action key
    keyHash: str
    type: str
    allowedTags: Optional[List[str]]
    trustedKeys: List[str]


class ActionMixin:
    @gql.django.field(only=["id", "cluster_id"])
    def availableActions(self, info: Info) -> List[ActionEntry]:
        name = self.__class__.__name__
        result = getattr(info.context, "secretgraphResult", {}).get(name, {})
        # only show some actions if not set
        has_manage = False
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
        # auth included unprotected ids
        seen_ids = set()
        # don't copy
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
                            result["decrypted"][key_val[1]].get("trustedKeys")
                            or []
                        ),
                        allowedTags=(
                            result["decrypted"][key_val[1]].get("allowedTags")
                            if key_val[0][0] not in {"view", "auth"}
                            else None
                        ),
                    )
        if has_manage:
            if isinstance(self, Content):
                for action in (
                    result.get("Action", {"objects": Action.objects.none()})[
                        "objects"
                    ]
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
                            result["decrypted"][key_val[1]].get("trustedKeys")
                            or []
                        ),
                        allowedTags=None,
                    )
            else:
                for action in (
                    result.get("Action", {"objects": Action.objects.none()})[
                        "objects"
                    ]
                    .filter(contentAction__isnull=True, cluster_id=self.id)
                    .exclude(id__in=seen_ids)
                ):
                    yield ActionEntry(
                        keyHash=action.keyHash,
                        type="other",
                        trustedKeys=(
                            result["decrypted"][key_val[1]].get("trustedKeys")
                            or []
                        ),
                        allowedTags=None,
                    )

    @gql.django.field(only=["id", "cluster_id"])
    def authOk(self, info: Info) -> bool:
        name = self.__class__.__name__
        result = getattr(info.context, "secretgraphResult", {}).get(name, {})

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


@gql.django.type(ContentReference, name="ContentReference")
class ContentReferenceNode(relay.Node):
    safe = False

    group: gql.auto
    extra: gql.auto

    deleteRecursive: DeleteRecursive

    @classmethod
    def resolve_id(cls, root) -> str:
        return f"{root.source.flexid}|{root.target.flexid}|{root.group}"

    @classmethod
    def resolve_node(
        cls,
        node_id: str,
        *,
        info: Info,
        required: bool = False,
    ) -> ContentReferenceNode:
        result = get_cached_result(info.context)["Content"]
        queryset = ContentReference.objects.all()
        try:
            source, target, group = id.node_id.split("|", 2)
            return queryset.get(
                source__in=fetch_contents(
                    result["objects"], result["actions"], source, noFetch=True
                ),
                target__in=fetch_contents(
                    result["objects"], result["actions"], target, noFetch=True
                ),
                group=group,
            )
        except ContentReference.DoesNotExist as exc:
            if required:
                raise exc
            return None
        except ValueError:
            return None

    @classmethod
    def resolve_connection(
        cls,
        *,
        root: Content,
        nodes: gql.django.Queryset[ContentReference],
        info: Info,
        # queryset
        total_count: Optional[int] = None,
        before: Optional[str] = None,
        after: Optional[str] = None,
        first: Optional[int] = None,
        last: Optional[int] = None,
        states: Optional[List[str]] = None,
        includeTypes: Optional[List[str]] = None,
        excludeTypes: Optional[List[str]] = None,
        includeTags: Optional[List[str]] = None,
        excludeTags: Optional[List[str]] = None,
        contentHashes: Optional[List[str]] = None,
        groups: Optional[List[str]] = None,
        deleted: UseCriteria = UseCriteria.FALSE,
    ):
        if (
            not isinstance(root, Content)
            or root.limited
            or root.cluster_id == 1
        ):
            return ContentReference.objects.none()
        result = get_cached_result(info.context)["Content"]
        query = result["objects"].exclude(hidden=True)
        if deleted != UseCriteria.IGNORE:
            query = query.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )
        filterob = {}
        if groups is not None:
            filterob["group__in"] = groups
        if info.field_name == "references":
            filterob["target__in"] = fetch_contents(
                query,
                result["actions"],
                states=states,
                includeTypes=includeTypes,
                excludeTypes=excludeTypes,
                includeTags=includeTags,
                excludeTags=excludeTags,
                contentHashes=contentHashes,
                noFetch=True,
            )
        else:
            filterob["source__in"] = fetch_contents(
                query,
                result["actions"],
                states=states,
                includeTypes=includeTypes,
                excludeTypes=excludeTypes,
                includeTags=includeTags,
                excludeTags=excludeTags,
                contentHashes=contentHashes,
                noFetch=True,
            )
        return relay.Connection.from_nodes(
            nodes.filter(
                **filterob,
            ),
            total_count=total_count,
            before=before,
            after=after,
            first=first,
            last=last,
        )

    @gql.django.field
    def source(self, info: Info) -> ContentNode:
        result = get_cached_result(info.context)["Content"]
        return fetch_contents(
            result["objects"].filter(references=self),
            result["actions"],
        ).first()

    @gql.django.field
    def target(self, info: Info) -> ContentNode:
        result = get_cached_result(info.context)["Content"]
        return fetch_contents(
            result["objects"].filter(referencedBy=self),
            result["actions"],
        ).first()


@gql.django.type(Content, name="Content")
class ContentNode(ActionMixin, relay.Node):
    nonce: gql.auto
    updated: gql.auto
    contentHash: gql.auto
    updateId: gql.auto
    type: gql.auto
    state: gql.auto
    deleted: Optional[datetime] = gql.django.field(
        field_name="markForDestruction"
    )
    link: str

    @gql.django.field()
    def tags(
        self: Content,
        info: Info,
        includeTags: Optional[List[str]] = None,
        excludeTags: Optional[List[str]] = None,
    ) -> List[str]:
        incl_filters = Q()
        excl_filters = Q()
        for i in includeTags or []:
            incl_filters |= Q(tag__startswith=i)

        for i in excludeTags or []:
            excl_filters |= Q(tag__startswith=i)
        tags = self.tags.filter(~excl_filters & incl_filters).values_list(
            "tag", flat=True
        )
        if self.limited:
            tags.filter(
                Q(tag__startswith="key_hash=") | Q(tag__startswith="name=")
            )
        return tags

    @gql.django.field()
    def signatures(
        self: Content,
        info: Info,
        includeAlgorithms: Optional[List[str]] = None,
    ) -> List[ContentNode]:
        # authorization often cannot be used, but it is ok, we have cached then
        result = get_cached_result(info.context)["Content"]
        return self.signatures(
            includeAlgorithms,
            ContentReference.objects.filter(target__in=result["objects"]),
        )

    @gql.django.field()
    def cluster(self: Content, info: Info) -> ClusterNode:
        if self.limited:
            return None
        # authorization often cannot be used, but it is ok, we have cached then
        res = (
            get_cached_result(info.context)["Cluster"]["objects"]
            .filter(id=self.cluster_id)
            .first()
        )
        if not res:
            res = Cluster.objects.get(id=self.cluster_id)
            res.limited = True
        return res

    @gql.django.field()
    def availableActions(self: Content, info: Info) -> List[ActionEntry]:
        if self.limited:
            return []
        return ActionMixin.availableActions(self, info)

    references: relay.Connection[ContentReferenceNode] = relay.connection()
    referencedBy: relay.Connection[ContentReferenceNode] = relay.connection()

    @classmethod
    def resolve_id(cls, root):
        if root.limited:
            return None
        return root.flexid

    @classmethod
    def resolve_node(cls, info, id, authorization=None, **kwargs):
        result = get_cached_result(info.context, authset=authorization)[
            "Content"
        ]
        return fetch_contents(
            result["objects"], result["actions"], id=str(id)
        ).first()

    @classmethod
    def resolve_connection(
        cls,
        *,
        nodes: Optional[gql.django.Queryset[Content]] = None,
        info: Info,
        # queryset
        total_count: Optional[int] = None,
        before: Optional[str] = None,
        after: Optional[str] = None,
        first: Optional[int] = None,
        last: Optional[int] = None,
        states: Optional[List[str]] = None,
        includeTypes: Optional[List[str]] = None,
        excludeTypes: Optional[List[str]] = None,
        includeTags: Optional[List[str]] = None,
        excludeTags: Annotated[
            Optional[List[str]],
            gql.argument(
                description="Use id=xy for excluding clusters with content ids"
            ),
        ] = None,
        contentHashes: Optional[List[str]] = None,
        clusters: Optional[List[relay.GlobalID]] = None,
        hidden: UseCriteria = UseCriteria.FALSE,
        featured: UseCriteria = UseCriteria.IGNORE,
        deleted: UseCriteria = UseCriteria.FALSE,
        public: UseCriteriaPublic = UseCriteriaPublic.IGNORE,
        minUpdated: Optional[datetime] = None,
        maxUpdated: Optional[datetime] = None,
    ):
        if nodes is None:
            nodes = Content.objects.all()
        result = get_cached_result(info.context)["Content"]
        # TODO: perm check for deleted and hidden
        if True:
            hidden = UseCriteria.FALSE
        if clusters:
            nodes = fetch_by_id(
                nodes,
                clusters,
                prefix="cluster__",
                limit_ids=None,
            )
        if public != UseCriteriaPublic.TOKEN:
            pass
        elif public != UseCriteriaPublic.IGNORE:
            # should only include public contents with public cluster
            # if no clusters are specified (e.g. root query)
            if public == UseCriteriaPublic.TRUE:
                if not clusters:
                    nodes = nodes.filter(
                        state__in=constants.public_states,
                        cluster__public=True,
                    )
                else:
                    nodes = nodes.filter(state__in=constants.public_states)
            else:
                nodes = nodes.exclude(state__in=constants.public_states)
        else:
            # only private or public with cluster public
            nodes = nodes.filter(
                ~Q(state__in=constants.public_states) | Q(cluster__public=True)
            )

        if deleted != UseCriteria.IGNORE:
            nodes = nodes.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )
        if hidden != UseCriteria.IGNORE:
            nodes = nodes.filter(hidden=hidden == UseCriteria.TRUE)
        nodes = nodes.filter(
            id__in=Subquery(
                result[
                    "objects_ignore_public"
                    if public == UseCriteriaPublic.TOKEN
                    else "objects"
                ].values("id")
            )
        )

        return relay.Connection.from_nodes(
            fetch_contents(
                nodes.distinct(),
                result["actions"],
                states=states,
                includeTypes=includeTypes,
                excludeTypes=excludeTypes,
                includeTags=includeTags,
                excludeTags=excludeTags,
                minUpdated=minUpdated,
                maxUpdated=maxUpdated,
                contentHashes=contentHashes,
            ),
            total_count=total_count,
            before=before,
            after=after,
            first=first,
            last=last,
        )


@gql.django.type(Cluster, name="Cluster")
class ClusterNode(ActionMixin, relay.Node):
    @classmethod
    def resolve_id(cls, root) -> str:
        if root.limited:
            return None
        return root.flexid

    @classmethod
    def resolve_node(cls, info: Info, id: relay.GlobalID, **kwargs):
        return fetch_clusters(
            get_cached_result(info.context)["Cluster"]["objects"],
            ids=str(id),
        ).first()

    @gql.django.field()
    def featured(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.featured

    @gql.django.field()
    def public(self) -> Optional[bool]:
        if self.limited:
            return None
        return self.public

    @gql.django.field()
    def updated(self) -> Optional[datetime]:
        if self.limited:
            return None
        return self.updated

    @gql.django.field()
    def deleted(self) -> Optional[datetime]:
        if self.limited:
            return None
        return self.markForDestruction

    @gql.django.field()
    def updateId(self) -> Optional[UUID]:
        if self.limited:
            return None
        return self.updateId

    @gql.django.field()
    def user(self) -> Optional[relay.GlobalID]:
        if self.limited:
            return None
        if not hasattr(self, "user"):
            return None
        #
        return self.user

    @gql.django.field()
    def availableActions(self, info: Info) -> List[ActionEntry]:
        if self.limited:
            return []
        return ActionMixin.availableActions(self, info)

    @gql.django.field()
    def name(self) -> Optional[str]:
        if self.limited:
            return None
        return self.name

    @gql.django.field()
    def description(self) -> Optional[str]:
        if self.limited:
            return None
        return self.description

    @gql.django.field()
    def groups(self, info) -> Optional[List[str]]:
        if self.limited:
            return None
        # remove hidden
        hidden = GlobalGroup.objects.get_hidden_names()
        return set(self.groups.values_list("name", flat=True)).difference(
            hidden
        )

    @gql.django.field()
    def contents(
        self,
        info,
        states: Optional[List[str]] = None,
        includeTypes: Optional[List[str]] = None,
        excludeTypes: Optional[List[str]] = None,
        includeTags: Optional[List[str]] = None,
        excludeTags: Annotated[
            Optional[List[str]],
            gql.argument(
                description="Use id=xy for excluding clusters with content ids"
            ),
        ] = None,
        contentHashes: Optional[List[str]] = None,
        minUpdated: Optional[datetime] = None,
        maxUpdated: Optional[datetime] = None,
    ) -> relay.Connection[ContentNode]:
        result = get_cached_result(info.context)["Content"]
        contents = result["objects"].filter(hidden=False)
        if self.limited:
            contents = contents.annotate(limited=True)
        return relay.Connection.from_nodes(
            fetch_contents(
                contents.filter(cluster_id=self.id),
                result["actions"],
                states=states,
                includeTypes=["PublicKey"] if self.limited else includeTypes,
                excludeTypes=excludeTypes,
                includeTags=includeTags,
                excludeTags=excludeTags,
                contentHashes=contentHashes,
            )
        )

    @classmethod
    def resolve_connection(
        cls,
        *,
        nodes: Optional[gql.django.Queryset[Cluster]] = None,
        info: Info,
        # queryset
        total_count: Optional[int] = None,
        before: Optional[str] = None,
        after: Optional[str] = None,
        first: Optional[int] = None,
        last: Optional[int] = None,
        search: Annotated[
            Optional[str],
            gql.argument(description="Search description and id"),
        ] = None,
        states: Optional[List[str]] = None,
        includeTypes: Optional[List[str]] = None,
        excludeTypes: Optional[List[str]] = None,
        includeTags: Optional[List[str]] = None,
        excludeTags: Annotated[
            Optional[List[str]],
            gql.argument(
                description="Use id=xy for excluding clusters with content ids"
            ),
        ] = None,
        ids: Optional[List[str]] = None,
        excludeIds: Annotated[
            Optional[List[str]],
            gql.argument(description="For excluding clusters with ids"),
        ] = None,
        contentHashes: Optional[List[str]] = None,
        user: Optional[relay.GlobalID] = None,
        featured: UseCriteria = UseCriteria.IGNORE,
        deleted: UseCriteria = UseCriteria.FALSE,
        public: UseCriteriaPublic = UseCriteriaPublic.IGNORE,
        minUpdated: Optional[datetime] = None,
        maxUpdated: Optional[datetime] = None,
    ):
        if not nodes:
            nodes = Cluster.objects.all()
        if user:
            if not getattr(settings, "AUTH_USER_MODEL", None) and not getattr(
                settings, "SECRETGRAPH_BIND_TO_USER", False
            ):
                # users are not supported in this configuration so ignore them
                user = None
            else:
                try:
                    user = relay.from_base64(user)[1]
                except Exception:
                    pass
                nodes = nodes.filter(user__pk=user)

        if search:
            nodes = nodes.filter(
                Q(flexid_cached__startswith=search)
                | Q(name__icontains=search)
                | Q(description__icontains=search)
            )

        if excludeIds is not None:
            nodes = nodes.exclude(flexid_cached__in=excludeIds)
        if deleted != UseCriteria.IGNORE:
            nodes = nodes.filter(
                markForDestruction__isnull=deleted == UseCriteria.FALSE
            )
        if (
            public != UseCriteriaPublic.IGNORE
            and public != UseCriteriaPublic.TOKEN
        ):
            nodes = nodes.filter(public=public == UseCriteriaPublic.TRUE)
        if featured != UseCriteria.IGNORE:
            nodes = nodes.filter(featured=featured == UseCriteria.TRUE)

        return relay.Connection.from_nodes(
            fetch_clusters(
                #  required for enforcing permissions
                nodes.filter(
                    id__in=Subquery(
                        get_cached_result(info.context)["Cluster"][
                            "objects_ignore_public"
                            if public == UseCriteriaPublic.TOKEN
                            else "objects"
                        ].values("id")
                    )
                ).distinct(),
                ids=ids,
                limit_ids=None,
                states=states,
                includeTypes=includeTypes,
                excludeTypes=excludeTypes,
                includeTags=includeTags,
                excludeTags=excludeTags,
                minUpdated=minUpdated,
                maxUpdated=maxUpdated,
                contentHashes=contentHashes,
            ),
            total_count=total_count,
            before=before,
            after=after,
            first=first,
            last=last,
        )


FlexidType = Union[ClusterNode, ContentNode]
