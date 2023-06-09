from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import OuterRef, Subquery

from ...models import ContentTag, NetGroup, SGroupProperty


def boolarg(val):
    return val == "true"


class Command(BaseCommand):
    help = "List, create or update Net Group(s)"

    def add_arguments(self, parser):
        parser.add_argument("name", nargs="?")
        parser.add_argument("--description", default=None)
        parser.add_argument("--properties", nargs="*", default=None)

    @staticmethod
    def print_group(net_group):
        print(repr(net_group))
        print("  description:", net_group.description)
        print(
            "  defined in settings:",
            net_group.name in settings.SECRETGRAPH_DEFAULT_NET_GROUPS,
        )
        print(
            "  managed:",
            (
                settings.SECRETGRAPH_DEFAULT_NET_GROUPS.get(net_group.name)
                or {"managed": False}
            ).get("managed", False),
        )
        print(
            "  Properties:",
            ", ".join(net_group.properties.values_list("name", flat=True)),
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
                    net_group.injectedKeys.annotate(
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
        properties,
        **options,
    ):
        if not name:
            for net_group in NetGroup.objects.all():
                self.print_group(net_group)
        else:
            net_group, created = NetGroup.objects.get_or_create(
                name=name,
            )

            if description is not None:
                net_group.description = description
            if description is not None:
                net_group.clean()
                net_group.save()

            if properties is not None:
                _properties = []
                for prop in set(filter(bool, properties)):
                    _properties.append(
                        SGroupProperty.objects.get_or_create(name=prop)[0]
                    )
                net_group.properties.set(_properties)
            elif created:
                net_group.properties.set(
                    SGroupProperty.objects.defaultNetProperties()
                )

            if description is not None or properties is not None:
                print("Create or Update Group:", name)
            self.print_group(net_group)
