import argparse
import re
from datetime import datetime, timedelta
from typing import cast

from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils.timezone import now

from ....core.constants import public_states
from ...models import Cluster, ClusterGroup, Content, ContentTag, Net
from ...utils.auth import fetch_by_id_noconvert


def boolarg(val):
    return val == "true"


def timeformat(val):
    if val.startswith("+"):
        return now() + timedelta(seconds=int(val[:1]))
    elif val == "now":
        return now() - timedelta(seconds=1)
    elif val and val != "null":
        return datetime.fromisoformat(val)
    else:
        return None


class Command(BaseCommand):
    help = "Scan for regex in user content and clusters e.g. to prevent abuse"

    def add_arguments(self, parser):
        deletion_g = parser.add_mutually_exclusive_group()
        parser.add_argument("--regex", "-r")
        parser.add_argument(
            "--id", dest="ids", action="extend", nargs="+", default=[]
        )
        parser.add_argument("--id-file", type=argparse.FileType("r"))
        parser.add_argument("-a", "--all-tags", action="store_true")
        parser.add_argument(
            "-l",
            dest="free_tag_scan",
            action="count",
            help="Removes tag scan protections. "
            "Can be multiple times specified: "
            "0 for name=, description= (default), "
            "1 exclusion of special tags, >=2 no restrictions",
            default=0,
        )
        parser.add_argument(
            "-p",
            "--private",
            action="count",
            help="Removes privacy protections. "
            "Can be multiple times specified: "
            "0 only global clusters and their contents (default), "
            "1 only clusters and public contents, >= 2 all",
            default=0,
        )
        parser.add_argument("-g", "--groups", nargs="+")
        parser.add_argument("-e", "--exclude-groups", nargs="+")
        parser.add_argument(
            "-s",
            "--scan",
            nargs="+",
            choices=["Content", "Cluster"],
            default=["Content", "Cluster"],
            help="Scan limits the regex scan to Model type. "
            'E.g. "...fooregex -s Cluster --change-active false" '
            "disables Net only if fooregex was found in Cluster description "
            "or name and not if it was found in a Tag",
        )
        parser.add_argument(
            "--active",
            type=boolarg,
            default=None,
        )
        parser.add_argument(
            "--hidden",
            type=boolarg,
            default=None,
        )
        parser.add_argument(
            "--featured",
            type=boolarg,
            default=None,
        )
        parser.add_argument(
            "--change-active",
            type=boolarg,
            default=None,
        )
        parser.add_argument(
            "--change-hidden",
            type=boolarg,
            default=None,
        )
        parser.add_argument(
            "--change-featured",
            type=boolarg,
            default=None,
        )
        parser.add_argument(
            "--change-public",
            type=boolarg,
        )
        deletion_g.add_argument(
            "--change-delete-content",
            type=timeformat,
            nargs="?",
            default=False,
        )
        deletion_g.add_argument(
            "--change-delete-cluster",
            type=timeformat,
            nargs="?",
            default=False,
        )
        parser.add_argument("--append-groups", nargs="+", default=())
        parser.add_argument("--remove-groups", nargs="+", default=())

    def handle(
        self,
        regex,
        groups,
        ids,
        id_file,
        exclude_groups,
        free_tag_scan,
        active,
        hidden,
        private,
        featured,
        all_tags,
        change_active,
        change_hidden,
        change_featured,
        change_public,
        change_delete_cluster,
        change_delete_content,
        append_groups: list[str] | tuple[str],
        remove_groups: list[str] | tuple[str],
        scan,
        **options,
    ):
        if id_file:
            ids.extend(map(lambda x: x.strip(), id_file.readlines()))
        cregex = None
        if regex:
            cregex = re.compile(regex)
        cluster_q = Q()
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
        # applies to contents and clusters excluding the system cluster
        if private == 0:
            cluster_q &= Q(globalNameRegisteredAt__isnull=False)

        # clusters
        clusters = Cluster.objects.filter(cluster_q)
        if append_groups:
            append_groups = ClusterGroup.objects.filter(
                name__in=set(append_groups).difference(remove_groups)
            )
        if remove_groups:
            remove_groups = ClusterGroup.objects.filter(name__in=remove_groups)

        if "Cluster" in scan:
            clusters_filtered = clusters
            if regex:
                clusters_filtered = clusters_filtered.filter(
                    Q(name__regex=regex) | Q(description__regex=regex)
                )
            if ids:
                clusters_filtered = fetch_by_id_noconvert(
                    clusters_filtered,
                    ids,
                    check_short_id=True,
                    check_short_name=True,
                )
            # applies only to clusters
            if private == 1:
                clusters_filtered = clusters_filtered.filter(
                    globalNameRegisteredAt__isnull=False
                )

            print("Cluster:")
            for c in clusters_filtered:
                print("  ", repr(c), sep="")
                print(
                    "    name",
                    " <match>" if cregex and cregex.search(c.name) else "",
                    ": ",
                    c.name,
                    sep="",
                )
                print(
                    "    description",
                    " <match>"
                    if cregex and cregex.search(c.description)
                    else "",
                    ": ",
                    c.description,
                    sep="",
                )
                print("    groups:")
                for g in c.groups.all():
                    print(f"      {g.name}")
        else:
            # stub
            clusters_filtered = Cluster.objects.none()

        contents_q = Q()
        if hidden is not None:
            contents_q &= Q(hidden=hidden)
        if private < 2:
            contents_q &= Q(state__in=public_states)

        tag_q = None
        if regex:
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
        if "Content" in scan:
            contents_filtered = (
                Content.objects.select_related("cluster")
                .prefetch_related("tags")
                .filter(
                    contents_q,
                    cluster__id__in=clusters.values("id"),
                )
            )
            if ids:
                contents_filtered = fetch_by_id_noconvert(
                    contents_filtered,
                    ids,
                    check_short_id=True,
                    check_short_name=True,
                )
            if tag_q:
                contents_filtered = contents_filtered.filter(
                    Exists(
                        ContentTag.objects.filter(
                            tag_q,
                            content_id=OuterRef("id"),
                        )
                    ),
                )

            print("Contents:")
            for c in contents_filtered:
                print("  ", repr(c), sep="")
                if c.cluster.name == "@system":
                    print("    <system content>, won't be changed")
                if all_tags:
                    print("    tags:")
                    for t in c.tags.all():
                        match = (
                            "<match>"
                            if cregex and cregex.search(t.tag)
                            else "<no match>"
                        )
                        print(f"      {match} {t}")
                elif tag_q:
                    print("    matching tags:")
                    for t in c.tags.filter(tag_q):
                        print(f"      {t}")
        else:
            # stub
            contents_filtered = Content.objects.none()
        # without contents of @system
        contents_affected = contents_filtered.exclude(cluster__name="@system")
        # only change non system cluster
        # show content of system cluster
        clusters_affected = Cluster.objects.filter(
            Q(Exists(contents_affected.filter(cluster_id=OuterRef("id"))))
            | Q(
                Exists(
                    clusters_filtered.filter(id=OuterRef("id")).exclude(
                        name="@system"
                    )
                )
            )
        )
        if change_active is not None:
            # for synching with user is_active
            for n in Net.objects.filter(
                Exists(clusters_affected.filter(net_id=OuterRef("id")))
            ):
                n.active = change_active
                n.save(update_fields=["active"])

        if change_public is not None:
            if change_public:
                clusters_affected.filter(
                    globalNameRegisteredAt__isnull=True
                ).filter(name__startswith="@").update(
                    globalNameRegisteredAt=now()
                )
            else:
                clusters_affected.update(
                    globalNameRegisteredAt=None, featured=False
                )
        if change_featured is not None:
            if change_featured:
                clusters_affected.filter(
                    globalNameRegisteredAt__isnull=False
                ).update(featured=True)
            else:
                clusters_affected.update(featured=False)
        if change_delete_cluster is not False:
            clusters_affected.update(markForDestruction=change_delete_cluster)
            contents_affected.update(markForDestruction=change_delete_content)
        elif change_delete_content is not False:
            contents_affected.update(markForDestruction=change_delete_content)

        if change_hidden is not None:
            contents_affected.update(hidden=change_hidden)
            # should also recursivly hide contents
            Content.objects.filter(
                cluster__id__in=clusters_affected.values("id")
            ).update(hidden=change_hidden)
        if append_groups:
            for g in cast(QuerySet[ClusterGroup], append_groups):
                g.clusters.add(clusters_affected)
        if remove_groups:
            for g in cast(QuerySet[ClusterGroup], remove_groups):
                g.clusters.remove(clusters_affected)
