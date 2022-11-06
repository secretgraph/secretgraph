from django.core.management.base import BaseCommand

from django.db.models import Subquery, OuterRef
from django.conf import settings
from ...models import GlobalGroup, GlobalGroupProperty, ContentTag


def boolarg(val):
    return val == "true"


class Command(BaseCommand):
    help = "Create or Update Global Group"

    def add_arguments(self, parser):
        parser.add_argument("name", nargs="?")
        parser.add_argument("--description", default=None)
        parser.add_argument(
            "--hidden", type=boolarg, default=None, choices=["true", "false"]
        )
        parser.add_argument(
            "--match-user-group",
            type=boolarg,
            default=None,
            choices=["true", "false"],
        )
        parser.add_argument("--properties", nargs="*", default=None)

    @staticmethod
    def print_group(global_group):
        print(repr(global_group))
        print("  description:", global_group.description)
        print("  hidden:", global_group.hidden)
        print("  matchUserGroup:", global_group.matchUserGroup)
        print(
            "  defined in settings:",
            global_group.name in settings.SECRETGRAPH_DEFAULT_GROUPS,
        )
        print(
            "  managed:",
            (
                settings.SECRETGRAPH_DEFAULT_GROUPS.get(global_group.name)
                or {"managed": False}
            ).get("managed", False),
        )
        print(
            "  Properties:",
            ", ".join(global_group.properties.values_list("name", flat=True)),
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
                    global_group.injectedKeys.annotate(
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
        hidden,
        properties,
        match_user_group,
        **options,
    ):
        if not name:
            for global_group in GlobalGroup.objects.all():
                self.print_group(global_group)
        else:
            global_group = GlobalGroup.objects.get_or_create(name=name)[0]

            if description is not None:
                global_group.description = description
            if hidden is not None:
                global_group.hidden = hidden
            if match_user_group is not None:
                global_group.matchUserGroup = match_user_group
            if (
                description is not None
                or hidden is not None
                or match_user_group is not None
            ):
                global_group.clean()
                global_group.save()
            # TODO: handle injectedKeys

            if properties is not None:
                _properties = []
                for prop in set(filter(lambda x: x, properties)):
                    _properties.append(
                        GlobalGroupProperty.objects.get_or_create(
                            name=prop, defaults={}
                        )[0]
                    )
                global_group.properties.set(_properties)

            if (
                description is not None
                or hidden is not None
                or match_user_group is not None
                or properties is not None
            ):
                print("Create or Update Group:", name)
            self.print_group(global_group)
