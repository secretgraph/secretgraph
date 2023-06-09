from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Q, Subquery
from django.utils import timezone

from ...models import Cluster, Content, Net


class Command(BaseCommand):
    help = "List and remove orphans"

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete", action="store_true", help="Delete Orphans"
        )
        parser.add_argument(
            "--unused-days",
            help="How many days inactivity count as unused",
            type=int,
            default=365,
        )
        parser.add_argument(
            "-w",
            "--what",
            choices=["Cluster", "Net"],
            nargs="+",
            default=["Cluster", "Net"],
        )

    def handle(self, **options):
        unused = timezone.now() - timedelta(days=options["unused_days"])
        if "Cluster" in options["what"]:
            annotated_clusters = Cluster.objects.annotate(
                last_content_accessed=Subquery(
                    Content.objects.filter(cluster_id=OuterRef("id"))
                    .order_by("-file_accessed")
                    .values("file_accessed")[:1]
                ),
                last_content_updated=Subquery(
                    Content.objects.filter(cluster_id=OuterRef("id"))
                    .order_by("-updated")
                    .values("updated")[:1]
                ),
            ).exclude(name="@system")
            q_orphan = Q(contents__isnull=True)
            q_unused = Q(
                last_content_accessed__isnull=True,
                last_content_updated__isnull=True,
                updated__lt=unused,
            ) | Q(
                last_content_accessed__lt=unused,
                last_content_updated__lt=unused,
            )
            orphan_and_unused_clusters = annotated_clusters.filter(
                q_orphan, q_unused
            )
            orphan_clusters = annotated_clusters.filter(q_orphan).exclude(
                id__in=Subquery(orphan_and_unused_clusters.values("id"))
            )
            if orphan_and_unused_clusters:
                print(
                    "Orphan and unused Clusters (no contents, "
                    "no interaction for some time):"
                )
                for c in orphan_and_unused_clusters:
                    print("  {!r} unused since {}".format(c, c.updated))
                    if options["delete"]:
                        orphan_and_unused_clusters.delete()
            if orphan_clusters:
                print(
                    "Orphan Clusters (no contents{}):".format(
                        ", not deleted" if options["delete"] else ""
                    )
                )
                for c in orphan_clusters:
                    print("  {!r} unused since {}".format(c, c.updated))
            unused_clusters = annotated_clusters.filter(q_unused).exclude(
                id__in=Subquery(orphan_and_unused_clusters.values("id"))
            )
            if unused_clusters:
                print(
                    "Unused Clusters{}:".format(
                        " (not deleted)" if options["delete"] else ""
                    )
                )
                for c in unused_clusters:
                    latest = c.last_content_accessed
                    if not latest or latest < c.last_content_updated:
                        latest = c.last_content_updated
                    if not latest:
                        latest = c.updated
                    print("  {!r} unused since {}".format(c, latest))

        if "Net" in options["what"]:
            # negative query, what scores for inactivity
            q = Q(
                last_content_accessed__isnull=False,
                last_content_accessed__lt=unused,
            ) | Q(last_action_used__isnull=True, last_used__lt=unused)
            # can contain contents from other nets
            vivid_clusters = Cluster.objects.filter(
                Q(contents__updated__gte=unused)
                | Q(contents__file_accessed__gte=unused)
                | Q(updated__gte=unused)
            )
            annotated_nets = Net.objects.annotate(
                last_content_accessed=Subquery(
                    Content.objects.filter(net_id=OuterRef("id"))
                    .order_by("-file_accessed")
                    .values("file_accessed")[:1]
                ),
                # last_used contains latest content and cluster update
            ).exclude(id=0)
            orphan_and_unused_nets = annotated_nets.filter(
                ~Exists(vivid_clusters.filter(net_id=OuterRef("id"))),
                q,
            )
            if orphan_and_unused_nets:
                print(
                    "Orphan and unused Nets (no contents and "
                    "no interaction for some time):"
                )
                for c in orphan_and_unused_nets:
                    latest = c.last_used
                    if (
                        c.last_content_accessed
                        and latest < c.last_content_accessed
                    ):
                        latest = c.last_content_accessed
                    print("  {!r} unused since {}".format(c, latest))
                if options["delete"]:
                    orphan_and_unused_nets.delete()
