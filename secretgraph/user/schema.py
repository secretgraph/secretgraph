import strawberry
from typing import Optional
from datetime import timedelta as td

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from graphene import relay
from graphene_django import DjangoObjectType

from ..server.actions.update import create_cluster_fn
from ..server.models import Cluster, Content
from ..server.utils.auth import ids_to_results, retrieve_allowed_objects


class UserNode(DjangoObjectType):
    class Meta:
        model = get_user_model()
        name = "User"
        interfaces = (relay.Node,)
        fields = ["email", "username", "clusters"]


@strawberry.input
class UserInput:
    # TODO: use form, keys
    email: str
    username: str


class UserMutation(relay.ClientIDMutation):
    class Input:
        id: Optional[ID]
        user: Optional[UserInput]

    user = UserNode
    actionKey: Optional[str]

    @classmethod
    def mutate_and_get_payload(cls, root, info, id=None, user=None):
        if id:
            if not user:
                raise ValueError()
            result = ids_to_results(info.context, id, Cluster, "manage")[
                "Cluster"
            ]
            cluster_obj = result["objects"].first()
            if not cluster_obj:
                raise ValueError()
            user_obj = cluster_obj.user
            return cls(user=user_obj)
        else:
            user = None
            manage = retrieve_allowed_objects(
                info.context, "manage", Cluster.actions.all()
            )["objects"].first()

            if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
                if manage:
                    admin_user = manage.user
                if not admin_user:
                    admin_user = getattr(info.context, "user", None)
                if not admin_user.is_authenticated:
                    raise ValueError("Must be logged in")
            elif (
                getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False)
                == "cluster"
                and not manage.exist()
            ):
                raise ValueError("Cannot register new cluster clusters")
            elif (
                getattr(settings, "SECRETGRAPH_ALLOW_REGISTER", False)
                is not True
            ):
                raise ValueError("Cannot register new cluster")
            user_obj = get_user_model().create_user()
            action_key = create_cluster_fn(info.context, None, user_obj)(
                transaction.atomic
            )[1]
            return cls(user=user_obj, actionKey=action_key)


class DeleteUserMutation(relay.ClientIDMutation):
    user: Optional[UserNode]

    @classmethod
    def mutate_and_get_payload(cls, info, id: ID):
        now = timezone.now()
        now_plus_x = now + td(minutes=20)
        # cleanup expired
        Content.objects.filter(markForDestruction__lte=now).delete()
        user = get_user_model().objects.get(pk=from_global_id(id)[0])
        result = retrieve_allowed_objects(
            info.context, "manage", Cluster.actions.all()
        )
        if user.clusters.exclude(
            id__in=result["objects"].values_list("id", flat=True)
        ):
            raise ValueError("No permission")
        user_contents = Content.objects.filter(cluster__user=user)
        if not user_contents.exists():
            user.delete()
        else:
            user_contents.filter(
                Q(markForDestruction__isnull=True)
                | Q(markForDestruction__gt=now_plus_x)
            ).update(markForDestruction=now_plus_x)
        return cls(user=user)


class Query:
    user: UserNode


class Mutation:
    signupUser = UserMutation.mutate_and_get_payload
    deleteUser = DeleteUserMutation.mutate_and_get_payload
