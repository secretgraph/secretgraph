from typing import Optional, Union

from django.db import models

from ....core.constants import MetadataOperations, UserSelectable
from ...models import Cluster, ClusterGroup, Net, NetGroup


def calculate_groups(
    model: Union[NetGroup, ClusterGroup],
    groups: list[str],
    operation=MetadataOperations.APPEND,
    initial=False,
    admin=False,
):
    # use values instead of enum for compatibility between graphql enums and constant enums
    if hasattr(operation, "value"):
        operation = operation.value
    if operation == MetadataOperations.APPEND:
        if admin:
            retval = model.objects.filter(name__in=groups)
        else:
            q = models.Q(userSelectable=UserSelectable.SELECTABLE) | models.Q(
                userSelectable=UserSelectable.UNRESTRICTED
            )
            if initial:
                q |= models.Q(
                    userSelectable=UserSelectable.INITIAL_MODIFYABLE,
                )
            q &= models.Q(name__in=groups)
            retval = model.objects.filter(q)
    elif operation == MetadataOperations.REPLACE:
        if admin:
            retval = (
                calculate_groups(
                    model=model,
                    groups=groups,
                    operation=MetadataOperations.APPEND,
                    initial=initial,
                    admin=True,
                ),
                model.objects.exclude(name__in=groups),
            )
        else:
            q = models.Q(userSelectable=UserSelectable.DESELECTABLE) | models.Q(
                userSelectable=UserSelectable.UNRESTRICTED
            )
            if initial:
                q |= models.Q(
                    userSelectable=UserSelectable.INITIAL_MODIFYABLE,
                )
            q &= ~models.Q(name__in=groups)
            retval = (
                calculate_groups(
                    model=model,
                    groups=groups,
                    operation=MetadataOperations.APPEND,
                    initial=initial,
                    admin=False,
                ),
                model.objects.filter(q),
            )
    else:
        assert operation == MetadataOperations.REMOVE, operation
        if admin:
            retval = model.objects.filter(name__in=groups)
        else:
            q = models.Q(userSelectable=UserSelectable.DESELECTABLE) | models.Q(
                userSelectable=UserSelectable.UNRESTRICTED
            )
            if initial:
                q |= models.Q(
                    userSelectable=UserSelectable.INITIAL_MODIFYABLE,
                )
            q &= models.Q(name__in=groups)
            retval = model.objects.filter(q)
    return retval


def apply_groups(
    inp: models.QuerySet[Union[Net, Cluster]] | Union[Net, Cluster],
    groups: Optional[models.QuerySet | tuple[models.QuerySet, models.QuerySet]] = None,
    operation=MetadataOperations.APPEND,
):
    # use values instead of enum for compatibility between graphql enums and constant enums
    if hasattr(operation, "value"):
        operation = operation.value
    if not isinstance(inp, models.QuerySet):
        inp = [inp]
    if operation == MetadataOperations.APPEND:
        if groups is not None:
            for obj in inp:
                obj.groups.add(groups)
            return True
    elif operation == MetadataOperations.REMOVE:
        if groups is not None:
            for obj in inp:
                obj.groups.remove(groups)
            return True
    else:
        assert operation == MetadataOperations.REPLACE, operation
        if groups is not None:
            assert isinstance(groups, tuple), f"invalid groups input: {groups}"
            if groups[0] and groups[1]:
                for obj in inp:
                    obj.groups.add(*groups[0])
                    obj.groups.remove(*groups[1])
            elif groups[0]:
                for obj in inp:
                    obj.groups.add(*groups[0])
            elif groups[1]:
                for obj in inp:
                    obj.groups.remove(*groups[1])
            else:
                return False
            return True
    return False
