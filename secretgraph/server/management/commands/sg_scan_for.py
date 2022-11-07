import re

from django.core.management.base import BaseCommand

from django.db.models import OuterRef, Exists
from django.db.models import Q
from ...models import Cluster, Content, ContentTag, GlobalGroup, Net


def boolarg(val):
    return val == "true"


class Command(BaseCommand):
    help = "Scan for regex in user content and clusters e.g. to prevent abuse"

    def add_arguments(self, parser):
        parser.add_argument("regex")
        parser.add_argument(
            "-l",
            dest="free_tag_scan",
            action="count",
            help="specify: 0 for name=, description= (default), "
            "1 exclusion of "
            "special tags, > 1 no restriction",
            default=0,
        )
        parser.add_argument("-g", "--groups", nargs="+")
        parser.add_argument("-e", "--exclude-groups", nargs="+")
        parser.add_argument(
            "--active", type=boolarg, default=None, choices=["true", "false"]
        )
        parser.add_argument(
            "--hidden", type=boolarg, default=None, choices=["true", "false"]
        )
        parser.add_argument(
            "--featured", type=boolarg, default=None, choices=["true", "false"]
        )
        parser.add_argument(
            "--change-active",
            type=boolarg,
            default=None,
            choices=["true", "false"],
        )
        parser.add_argument(
            "--change-hidden",
            type=boolarg,
            default=None,
            choices=["true", "false"],
        )
        parser.add_argument(
            "--remove-featured",
            action="store_true",
            help="remove featured flag",
        )
        parser.add_argument("--append-groups", nargs="+")

    def handle(
        self,
        regex,
        groups,
        exclude_groups,
        free_tag_scan,
        active,
        hidden,
        featured,
        change_active,
        change_hidden,
        append_groups,
        remove_featured,
        **options,
    ):
        cregex = re.compile(regex)
        cluster_q = Q(name__regex=regex) | Q(description__regex=regex)
        if active is not None:
            cluster_q &= Q(net__active=active)
        if featured is not None:
            cluster_q &= Q(featured=featured)
        if groups is not None:
            cluster_q &= Q(
                groups__name__in=set(groups).difference(exclude_groups or [])
            )
        elif exclude_groups:
            cluster_q &= ~Q(groups__name__in=exclude_groups)

        print("Cluster:")
        clusters = Cluster.objects.filter(cluster_q)
        groups = None
        if append_groups:
            groups = GlobalGroup.objects.filter(name__in=append_groups)
        if remove_featured:
            clusters.update(featured=False)
        if change_active:
            # for synching with user is_active
            for n in Net.objects.filter(
                Exists(clusters.filter(net_id=OuterRef("id")))
            ):
                n.active = change_active
                n.save(update_fields=["active"])

        for c in clusters:
            if groups:
                c.groups.add(*groups)
            print("  ", repr(c), sep="")
            print(
                "    name",
                " <match>" if cregex.search(c.name) else "",
                ": ",
                c.name,
                sep="",
            )
            print(
                "    description",
                " <match>" if cregex.search(c.description) else "",
                ": ",
                c.description,
                sep="",
            )
        print("Contents:")
        contents_q = Q()
        if hidden is not None:
            contents_q &= Q(hidden=hidden)

        tag_q = Q(tag__regex=regex)
        if free_tag_scan == 0:
            tag_q &= Q(tag__startswith="name=") | Q(
                tag__startswith="description="
            )
        elif free_tag_scan == 1:
            # exclude special contenttags to prevent confusion
            tag_q &= (
                ~Q(tag__startswith="~")
                & ~Q(tag__startswith="key=")
                & ~Q(tag__startswith="key_hash=")
            )
        contents = Content.objects.prefetch_related("tags").filter(
            contents_q,
            Exists(
                ContentTag.objects.filter(
                    tag_q,
                    content_id=OuterRef("id"),
                )
            ),
        )
        if change_hidden:
            contents.update(hidden=change_hidden)
        for c in contents:
            print("  ", repr(c), sep="")
            print("    found tags:")
            for t in c.tags.filter(tag_q):
                print(f"      {t}")
