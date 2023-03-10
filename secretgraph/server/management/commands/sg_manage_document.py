import argparse
from os import path
from typing import Optional
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.db.models.functions import Substr
from django.test.client import RequestFactory
from django.urls import reverse

from ...models import Content, ContentTag, Cluster
from ...actions.update import (
    create_content_fn,
    update_content_fn,
    ContentInput,
    ContentValueInput,
)


def lowerStr(inp: str):
    return inp.lower()


class Command(BaseCommand):
    help = "Manage global documents (list, update, create)"

    def add_arguments(self, parser):
        parser.add_argument("file", type=argparse.FileType("r"), nargs="?")
        parser.add_argument("--name")
        parser.add_argument("--description")
        parser.add_argument("--mime", default="text/html", type=lowerStr)

    def handle(self, **options):
        if options["file"]:
            return self.handle_update(**options)
        else:
            return self.list_documents(**options)

    def list_documents(self, **options):
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
        contents = Content.objects.global_documents(True).annotate(
            name=Subquery(name_sub), description=Subquery(description_sub)
        )
        print("Documents found:")
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

    def handle_update(self, name, file, description, mime, **options):
        cluster = Cluster.objects.get(name="@system")
        if not name and file.name and file.name != "-":
            name = path.splitext(path.basename(file.name))[0]
        if not name:
            raise ValueError("Name could not be determinated")
        content: Optional[Content] = (
            Content.objects.global_documents(True)
            .filter(
                tags__tag=f"name={name}",
            )
            .first()
        )

        url = reverse("graphql-plain")
        request = RequestFactory().get(url)
        tags = [f"name={name}", f"mime={mime}"]
        if description:
            tags.append(f"description={description}")
        content_input = ContentInput(
            net=cluster.net,
            cluster=cluster,
            hidden=False,
            value=ContentValueInput(
                value=file,
                state="public",
                type="Text",
                tags=tags,
            ),
        )
        if content:
            content.markForDestruction = None
            handle = update_content_fn(
                request,
                content,
                content_input,
                updateId=content.updateId,
                authset=[],
            )
        else:
            handle = create_content_fn(
                request,
                content_input,
                authset=[],
            )

        with transaction.atomic():
            content = handle()["content"]
        print("Content ID of document:", content.flexid_cached)
