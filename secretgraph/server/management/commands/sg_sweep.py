from asgiref.sync import async_to_sync
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Manually sweep expired Contents and Clusters"

    def add_arguments(self, parser):
        parser.add_argument(
            "-a",
            "--all-deleted",
            action="store_true",
            help="Delete all Contents and Clusters slated for deletion "
            "regardless of their expiry time",
        )

    def handle(self, all_deleted, **options):
        from ...signals import sweepOutdated

        async_to_sync(sweepOutdated)(ignoreTime=all_deleted)
