import posixpath

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

from ...models import Content


class Command(BaseCommand):
    help = "Remove unreferenced files in media"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle_directory(self, keep_set, dry_run, directory):
        directories, files = default_storage.listdir(directory)
        count = len(files) + len(directories)
        for file in files:
            full_file = posixpath.join(directory, file)
            if full_file not in keep_set:
                if dry_run:
                    print("would delete file", full_file)
                else:
                    default_storage.delete(full_file)
                count -= 1

        for sub_directory in directories:
            if self.handle_directory(
                keep_set, dry_run, posixpath.join(directory, sub_directory)
            ):
                count -= 1
        if count == 0:
            if dry_run:
                print("would delete directory", directory)
            else:
                default_storage.delete(directory)
            return True
        return False

    def handle(self, dry_run, **options):
        keep_set = set(Content.objects.values_list("file", flat=True))
        if default_storage.exists("secretgraph"):
            self.handle_directory(keep_set, dry_run, "secretgraph")
