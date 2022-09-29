from base64 import b64encode
import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.test.client import RequestFactory
from django.urls import reverse

from ...models import Net, Cluster
from ...actions.update import manage_actions_fn, ActionInput


class Command(BaseCommand):
    help = "Create cluster"

    def add_arguments(self, parser):
        parser.add_argument("--token", default=None, help="Manage token")
        parser.add_argument("--quota", default=None, type=int)
        parser.add_argument("--bits", "-b", type=int, default=4096)
        parser.add_argument("--max_upload_size", default=None, type=int)
        parser.add_argument("--net", default=None)
        parser.add_argument("--user", default=None)
        parser.add_argument("--name", default="")
        parser.add_argument("--description", default="")

    def handle(self, **options):
        if not options["token"]:
            options["token"] = b64encode(os.urandom(32)).decode("ascii")
        if options["net"]:
            if options["net"].isdigit():
                net = Net.objects.get(id=options["net"])
            else:
                net = Net.objects.get(
                    Q(cluster__flexid=options["net"])
                    | Q(cluster__flexid_cached=options["net"])
                )
        else:
            net = Net()
            if options["user"]:
                User = get_user_model()
                net.user = User.objects.get(
                    **{User.USERNAME_FIELD: options["user"]}
                )
            if options["quota"]:
                net.quota = options["quota"]
            else:
                net.reset_quota()

            if options["max_upload_size"]:
                net.max_upload_size = options["max_upload_size"]
            else:
                net.reset_max_upload_size()
        request = RequestFactory().get(reverse("graphql-plain"))
        cluster = Cluster(
            net=net,
            name=options["name"],
            description=options["description"],
        )
        save_actions = manage_actions_fn(
            request,
            cluster,
            [ActionInput(value='{"action": "manage"}', key=options["token"])],
            authset=[],
            admin=True,
        )
        with transaction.atomic():
            if not net.id:
                net.save()
            cluster.save()
            save_actions()
        print("Cluster:", cluster.flexid_cached)
        print("Manage token:", options["token"])
