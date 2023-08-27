from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Manually unlock Contents"

    def add_arguments(self, parser):
        parser.add_argument("-b", "--before-days", type=int, default=365)

    def handle(self, before_days, **options):
        from ...models import Content

        Content.objects.filter(
            locked__isnull=False,
            locked__lt=timezone.now() - timedelta(days=before_days),
        ).update(locked=None)
