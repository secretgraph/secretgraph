from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef

from ...models import Net, Cluster


class Command(BaseCommand):
    help = "List and remove orphans"

    def add_arguments(self, parser):
        parser.add_argument(
            "--delete", action="store_true", help="Delete Orphans"
        )
        parser.add_argument(
            "-w",
            "--what",
            choices=["Cluster", "Net"],
            nargs="+",
            default=["Cluster", "Net"],
        )

    def handle(self, **options):
        if "Cluster" in options["what"]:
            orphan_clusters = Cluster.objects.filter(contents__isnull=True)
            if orphan_clusters:
                print("Orphan Clusters:")
                for c in orphan_clusters:
                    print("  {!r}".format(c))
                if options["delete"]:
                    orphan_clusters.delete()

        if "Net" in options["what"]:
            vivid_clusters = Cluster.objects.filter(contents__isnull=True)
            orphan_nets = Net.objects.filter(
                ~Exists(vivid_clusters.filter(net_id=OuterRef("id")))
            )
            if orphan_nets:
                print("Orphan Nets:")
                for c in orphan_nets:
                    print("  {!r}".format(c))
                if options["delete"]:
                    orphan_nets.delete()
