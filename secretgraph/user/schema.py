from datetime import timedelta as td
from typing import Optional

import strawberry
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q, Subquery
from django.utils import timezone
from strawberry import relay
from strawberry.types import Info
from strawberry_django import type as django_type

from ..server.models import Cluster, Content
from ..server.utils.auth import ids_to_results, retrieve_allowed_objects

user_model = get_user_model()


django_type(user_model, name="User")


class UserNode(relay.Node):
    email: str
    username: str

    # @gql.django.field
    # def clusters(self) -> List[ClusterNode]:
    #    return se

    @classmethod
    def resolve_id(
        cls,
        root,
        *,
        info: Info,
    ):
        return getattr(root, user_model.USERNAME_FIELD)


@strawberry.input
class UserInput:
    # TODO: use form, keys
    email: str
    username: str


@strawberry.type
class UserMutation(relay.Node):
    user = UserNode

    @classmethod
    async def mutate_and_get_payload(
        cls,
        info: Info,
        id: Optional[strawberry.ID] = None,
        user: Optional[UserInput] = None,
    ):
        if id:
            if not user:
                raise ValueError()
            result = await ids_to_results(
                info.context["request"],
                id,
                Cluster,
                scope="manage",
                cacheName=None,
            )["Cluster"]
            cluster_obj = result["objects_without_public"].first()
            if not cluster_obj:
                raise ValueError()
            user_obj = cluster_obj.user
            return cls(user=user_obj)
        else:
            user = None
            manage = await (
                await retrieve_allowed_objects(
                    info.context["request"], "Cluster", scope="manage"
                )["objects_without_public"]
            ).afirst()

            if getattr(settings, "SECRETGRAPH_REQUIRE_USER", False):
                if manage:
                    admin_user = manage.user
                if not admin_user:
                    admin_user = getattr(info.context["request"], "user", None)
                if not admin_user or not admin_user.is_authenticated:
                    raise ValueError("Must be logged in")
            elif (
                getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False) == "cluster"
                and not manage
            ):
                raise ValueError("Cannot register new clusters")
            elif getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False) is not True:
                raise ValueError("Cannot register new cluster")
            user_obj = user_model.create_user()
            return cls(user=user_obj)


@strawberry.type
class DeleteUserMutation(relay.Node):
    user: Optional[UserNode]

    @classmethod
    async def mutate_and_get_payload(cls, info: Info, id: strawberry.ID):
        now = timezone.now()
        now_plus_x = now + td(minutes=20)
        # cleanup expired
        Content.objects.filter(markForDestruction__lte=now).delete()
        user = user_model.objects.get(pk=id.node_id)
        result = await retrieve_allowed_objects(
            info.context["request"], "Cluster", scope="manage"
        )
        if user.net.clusters.exclude(
            id__in=Subquery(result["objects_without_public"].values("id"))
        ):
            raise ValueError("No permission")
        user_contents = Content.objects.filter(cluster__user=user)
        if not await user_contents.aexists():
            await user.adelete()
        else:
            await user_contents.filter(
                Q(markForDestruction__isnull=True)
                | Q(markForDestruction__gt=now_plus_x)
            ).aupdate(markForDestruction=now_plus_x)
        return cls(user=user)


class Query:
    user: UserNode


class Mutation:
    signupUser = UserMutation.mutate_and_get_payload
    deleteUser = DeleteUserMutation.mutate_and_get_payload
