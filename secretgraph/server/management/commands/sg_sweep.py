from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Manually sweep expired Contents and Clusters"

    def handle(self, **options):
        from ...signals import sweepContentsAndClusters

        sweepContentsAndClusters()
