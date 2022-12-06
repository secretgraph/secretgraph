from datetime import timedelta
from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Q, Subquery
from django.utils import timezone

from ...models import Action, Net, Cluster


class Command(BaseCommand):
    help = "List and remove orphans"

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete", action="store_true", help="Delete Orphans"
        )
        parser.add_argument(
            "--inactive",
            action="store_true",
            help="List (and delete) inactive",
        )
        parser.add_argument(
            "-w",
            "--what",
            choices=["Cluster", "Net"],
            nargs="+",
            default=["Cluster", "Net"],
        )

    def handle(self, **options):
        inactive = timezone.now() - timedelta(weeks=52)
        if "Cluster" in options["what"]:
            annotated_clusters = Cluster.objects.annotate(
                last_action_used=Subquery(
                    Action.objects.filter(cluster_id=OuterRef("id"))
                    .order_by("-used")
                    .values("used")[:1]
                ),
            ).exclude(name="@system")
            orphan_clusters = annotated_clusters.filter(contents__isnull=True)
            if orphan_clusters:
                print("Orphan Clusters:")
                for c in orphan_clusters:
                    print(
                        "  {!r} inactive since {}".format(
                            c, c.last_action_used or c.updated
                        )
                    )
                if options["delete"]:
                    orphan_clusters.delete()
            if options["inactive"]:
                inactive_clusters = annotated_clusters.exclude(
                    id__in=Subquery(orphan_clusters.values("id"))
                ).filter(
                    (
                        Q(last_action_used__isnull=True)
                        & Q(created__lt=inactive)
                    )
                    | Q(last_action_used__lt=inactive)
                )

                print("Inactive Clusters:")
                for c in inactive_clusters:
                    print(
                        "  {!r} inactive since {}".format(
                            c, c.last_action_used or c.updated
                        )
                    )

        if "Net" in options["what"]:
            q = Q()
            if options["inactive"]:
                q = Q(last_action_used__isnull=False) & Q(
                    last_action_used__gte=inactive
                ) | Q(last_used_gt=inactive)
            vivid_clusters = Cluster.objects.filter(contents__isnull=False)
            orphan_nets = (
                Net.objects.annotate(
                    last_action_used=Subquery(
                        Action.objects.filter(cluster__net_id=OuterRef("id"))
                        .order_by("-used")
                        .values("used")[:1]
                    )
                )
                .exclude(id=0)
                .filter(
                    ~Exists(vivid_clusters.filter(net_id=OuterRef("id"))), q
                )
            )
            if orphan_nets:
                print("Orphan Nets:")
                for c in orphan_nets:
                    latest = c.last_used
                    if c.last_action_used and c.last_action_used > latest:
                        latest = c.last_action_used
                    print("  {!r} inactive since {}".format(c, latest))
                if options["delete"]:
                    orphan_nets.delete()
