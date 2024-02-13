from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef, Subquery

from ....core.constants import UserSelectable
from ...models import ClusterGroup, Content, ContentTag, SGroupProperty


def boolarg(val):
    return val == "true"


def _hashbuilder_helper(inp: str):
    return "key_hash={}".format(inp.removeprefix("Key:"))


class Command(BaseCommand):
    help = "List, create or update Cluster Group(s)"

    def add_arguments(self, parser):
        parser.add_argument("name", nargs="?")
        parser.add_argument("--description", default=None)
        parser.add_argument(
            "--user-selectable",
            choices=UserSelectable.__members__.keys(),
            default=None,
        )
        parser.add_argument(
            "--hidden",
            type=boolarg,
            default=None,
        )
        parser.add_argument("--properties", nargs="*", default=None)
        parser.add_argument("--injected-keys", nargs="*", default=None)

    @staticmethod
    def print_group(cluster_group):
        print(repr(cluster_group))
        print("  description:", cluster_group.description)
        print(
            "  user selectable:",
            UserSelectable(cluster_group.userSelectable).name,
        )
        print("  hidden:", cluster_group.hidden)
        print(
            "  defined in settings:",
            cluster_group.name in settings.SECRETGRAPH_DEFAULT_CLUSTER_GROUPS,
        )
        print(
            "  managed:",
            (
                settings.SECRETGRAPH_DEFAULT_CLUSTER_GROUPS.get(cluster_group.name)
                or {"managed": False}
            ).get("managed", False),
        )
        print(
            "  Properties:",
            ", ".join(cluster_group.properties.values_list("name", flat=True)),
        )
        print(
            "  Injected Keys:",
            ", ".join(
                map(
                    lambda x: "{} ({}): {}".format(
                        x.name, x.contentHash, x.description or ""
                    )
                    if x.name
                    else "{}: {}".format(x.contentHash, x.description or ""),
                    cluster_group.injectedKeys.annotate(
                        name=Subquery(
                            ContentTag.objects.filter(
                                content_id=OuterRef("id"),
                                tag__startswith="name=",
                            ).values("tag")[:1]
                        ),
                        description=Subquery(
                            ContentTag.objects.filter(
                                content_id=OuterRef("id"),
                                tag__startswith="description=",
                            ).values("tag")[:1]
                        ),
                    ),
                )
            ),
        )

    def handle(
        self,
        name,
        description,
        user_selectable,
        hidden,
        properties,
        injected_keys,
        **options,
    ):
        if not name:
            for cluster_group in ClusterGroup.objects.all():
                self.print_group(cluster_group)
        else:
            cluster_group, created = ClusterGroup.objects.get_or_create(
                name=name,
            )

            if description is not None:
                cluster_group.description = description
            if user_selectable is not None:
                cluster_group.userSelectable = getattr(
                    UserSelectable, user_selectable
                ).value
            if hidden is not None:
                cluster_group.hidden = hidden
            if (
                description is not None
                or user_selectable is not None
                or hidden is not None
            ):
                cluster_group.full_clean()
                cluster_group.save()

            if properties is not None:
                _properties = []
                for prop in set(filter(bool, properties)):
                    _properties.append(
                        SGroupProperty.objects.get_or_create(name=prop)[0]
                    )
                cluster_group.properties.set(_properties)
            elif created:
                cluster_group.properties.set(
                    SGroupProperty.objects.defaultNetProperties()
                )

            if injected_keys is not None:
                hashes = list(map(_hashbuilder_helper, injected_keys))
                injectedKeys = Content.objects.filter(
                    Exists(
                        ContentTag.objects.filter(
                            content_id=OuterRef("id", tag__in=hashes)
                        )
                    ),
                    cluster__name="@system",
                    type="PublicKey",
                )
                cluster_group.injectedKeys.set(injectedKeys)

            if (
                description is not None
                or hidden is not None
                or properties is not None
                or injected_keys is not None
            ):
                print("Create or Update Group:", name)
            self.print_group(cluster_group)
