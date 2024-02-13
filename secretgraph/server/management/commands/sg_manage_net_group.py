from django.conf import settings
from django.core.management.base import BaseCommand

from ....core.constants import UserSelectable
from ...models import NetGroup, SGroupProperty


def boolarg(val):
    return val == "true"


class Command(BaseCommand):
    help = "List, create or update Net Group(s)"

    def add_arguments(self, parser):
        parser.add_argument("name", nargs="?")
        parser.add_argument("--description", default=None)
        parser.add_argument(
            "--user-selectable",
            choices=UserSelectable.__members__.keys(),
            default=None,
        )
        parser.add_argument("--properties", nargs="*", default=None)

    @staticmethod
    def print_group(net_group):
        print(repr(net_group))
        print("  description:", net_group.description)
        print("  user selectable:", UserSelectable(net_group.userSelectable).name)
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

    def handle(
        self,
        name,
        description,
        user_selectable,
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
            if user_selectable is not None:
                net_group.userSelectable = getattr(
                    UserSelectable, user_selectable
                ).value
            if description is not None or user_selectable is not None:
                net_group.full_clean()
                net_group.save()

            if properties is not None:
                _properties = []
                for prop in set(filter(bool, properties)):
                    _properties.append(
                        SGroupProperty.objects.get_or_create(name=prop)[0]
                    )
                net_group.properties.set(_properties)
            elif created:
                net_group.properties.set(SGroupProperty.objects.defaultNetProperties())

            if description is not None or properties is not None:
                print("Create or Update Group:", name)
            self.print_group(net_group)
