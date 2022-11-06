import re

from django.core.management.base import BaseCommand

from django.db.models import Subquery, OuterRef
from django.db.models import Q
from ...models import Cluster, Content, ContentTag


class Command(BaseCommand):
    help = "Scan for regex in user content and clusters e.g. to prevent abuse"

    def add_arguments(self, parser):
        parser.add_argument("regex")
        parser.add_argument("--free-scan", action="store_true")

    def handle(
        self,
        regex,
        free_scan,
        **options,
    ):
        cregex = re.compile(regex)
        print("Cluster:")
        for c in Cluster.objects.filter(
            Q(name__regex=regex) | Q(description__regex=regex)
        ):
            print("  ", repr(c), sep="")
            print("    name:", cregex.match(c.name), c.name)
            print(
                "    description:", cregex.match(c.description), c.description
            )
        print("Contents:")
        q = Q(tag__regex=regex)
        if not free_scan:
            q &= Q(tag__startswith="name=") | Q(tag__startswith="description=")
        else:
            # exclude encrypted contenttags to prevent confusion
            q &= ~Q(tag__startswith="~")
        for c in Content.objects.annotate(
            found_tags=Subquery(
                ContentTag.objects.filter(
                    q,
                    content_id=OuterRef("id"),
                ).values("tag")
            )
        ).filter(found_tags__isnull=False):
            print("  ", repr(c), sep="")
            print("    found tags:")
            # TODO: should not happen
            if isinstance(c.found_tags, str):
                return print(f"      {c.found_tags}")
            else:
                for t in c.found_tags:
                    print(f"      {t}")
