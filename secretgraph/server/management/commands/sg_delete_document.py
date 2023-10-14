import time
from datetime import timedelta

from asgiref.sync import async_to_sync
from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Subquery
from django.db.models.functions import Substr
from django.utils.timezone import now

from ...models import Content, ContentTag
from ...signals import sweepOutdated


class Command(BaseCommand):
    help = "Delete global document"

    def add_arguments(self, parser):
        parser.add_argument("names", nargs="*")
        parser.add_argument("--noconfirm", action="store_true")
        parser.add_argument("--purge", action="store_true")

    def handle(self, names, purge, noconfirm, **options):
        tags = ContentTag.objects.filter(
            tag__in=map(lambda x: f"name={x}", names)
        )

        name_sub = (
            ContentTag.objects.filter(
                tag__startswith="name=", content_id=OuterRef("id")
            )
            .annotate(name=Substr("tag", 6))
            .values("name")
        )
        description_sub = (
            ContentTag.objects.filter(
                tag__startswith="description=", content_id=OuterRef("id")
            )
            .annotate(name=Substr("tag", 12))
            .values("name")
        )
        contents = (
            Content.objects.global_documents(True)
            .filter(Exists(tags.filter(content_id=OuterRef("id"))))
            .annotate(
                name=Subquery(name_sub), description=Subquery(description_sub)
            )
        )
        if not contents:
            print("No documents found")
            return

        if noconfirm:
            print(
                "following documents are {}".format(
                    "purged" if purge else "deleted"
                )
            )
        else:
            print(
                ("Do you really want to {} " "following documents?").format(
                    "purge" if purge else "delete"
                )
            )
        for c in contents:
            deleted = "d" if c.markForDestruction else ""
            hidden = "h" if c.hidden else ""
            states = f"{deleted}{hidden}"
            if states:
                states = f"{c.state} {states}"
            else:
                states = c.state
            description = c.description or ""
            print(f"  {c.name} ({states}): {description}")
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
        if purge:
            time.sleep(2)
            async_to_sync(sweepOutdated)()
