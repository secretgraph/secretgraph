import argparse
from os import path
from typing import Optional
from django.core.management.base import BaseCommand
from django.db import transaction
from django.test.client import RequestFactory
from django.urls import reverse

from ...models import Cluster, Content
from ...actions.update import (
    create_content_fn,
    update_content_fn,
    ContentInput,
    ContentValueInput,
)


class Command(BaseCommand):
    help = "Create cluster"

    def add_arguments(self, parser):
        parser.add_argument("file", type=argparse.FileType("r"))
        parser.add_argument("--name")
        parser.add_argument("--description")
        parser.add_argument("--mime", default="text/html")

    def handle(self, name, file, description, mime, **options):
        if not name and file.name and file.name != "-":
            name = path.splitext(path.basename(file.name))[0]
        if not name:
            raise ValueError("Name could not be determinated")
        cluster = Cluster.objects.get(name="@system")
        content: Optional[Content] = cluster.contents.filter(
            type="Text", tags__tag=f"name={name}"
        ).first()

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
