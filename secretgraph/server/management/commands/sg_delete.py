import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Subquery
from django.utils.timezone import now

from ...models import Cluster, Content
from ...signals import sweepOutdated
from ...utils.auth import fetch_by_id_noconvert


class Command(BaseCommand):
    help = "Simply delete contents or clusters"

    def add_arguments(self, parser):
        parser.add_argument("ids", nargs="*")
        parser.add_argument("--noconfirm", action="store_true")
        parser.add_argument("--purge", action="store_true")

    def handle(self, ids, noconfirm, purge, **options):
        clusters = fetch_by_id_noconvert(
            Cluster.objects.exclude(name="@system"),
            ids,
            check_short_name=True,
        )
        contents = fetch_by_id_noconvert(
            Content.objects.all(),
            ids,
        )
        if not contents and not clusters:
            print("No contents or clusters found")
            return
        if noconfirm:
            print(
                "following contents and clusters are {}".format(
                    "purged" if purge else "deleted"
                )
            )
        else:
            print(
                (
                    "Do you really want to {} "
                    "following contents and clusters?"
                ).format("purge" if purge else "delete")
            )
        print("Clusters:")
        for c in clusters:
            print(f"  {c!r}")
        print("Contents:")
        for c in contents:
            print(f"  {c!r}")
        print("From cluster deletion affected contents:")
        for c in Content.objects.exclude(
            id__in=Subquery(contents.values("id"))
        ):
            print(f"  {c!r}")
        if not noconfirm:
            if input(
                'Really {}? Type "yes"\n'.format(
                    "purge" if purge else "delete"
                )
            ) not in {"yes", "y"}:
                return
        timestamp = now()
        if not purge:
            timestamp += timedelta(hours=2)
        contents.update(markForDestruction=timestamp)
        Content.objects.filter(
            cluster_id__in=Subquery(clusters.values("id"))
        ).update(markForDestruction=timestamp)
        clusters.update(markForDestruction=timestamp)
        if purge:
            time.sleep(2)
            sweepOutdated()
