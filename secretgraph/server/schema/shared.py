import strawberry
from enum import Enum

from ...core import constants


# remove when proper fixed
def _fixup_enum_value(enum):
    new_enum = Enum(
        enum.__name__,
        map(
            lambda enum_value: (enum_value.name, enum_value.value),
            enum._enum_definition.values,
        ),
        module=enum.__module__,
        qualname=enum.__qualname__,
    )
    new_enum._enum_definition = enum._enum_definition
    return new_enum


@_fixup_enum_value
@strawberry.enum(description="Specify policy for recursive deletions")
class DeleteRecursive(Enum):
    TRUE = strawberry.enum_value(
        constants.DeleteRecursive.TRUE.value,
        description=(
            "Delete content when referenced content is deleted (default)"
        ),
    )
    FALSE = strawberry.enum_value(
        constants.DeleteRecursive.FALSE.value,
        description="Keep content when referenced content is deleted",
    )
    NO_GROUP = strawberry.enum_value(
        constants.DeleteRecursive.NO_GROUP.value,
        description=(
            "Delete content when referenced content is deleted and "
            "no other reference with the same group is remaining"
        ),
    )


@strawberry.enum(description="Specify criteria")
class UseCriteria(Enum):
    TRUE = constants.UseCriteria.TRUE.value
    FALSE = constants.UseCriteria.FALSE.value
    IGNORE = constants.UseCriteria.IGNORE.value


@_fixup_enum_value
@strawberry.enum(description="Specify criteria")
class UseCriteriaPublic(Enum):
    TRUE = constants.UseCriteriaPublic.TRUE.value
    FALSE = constants.UseCriteriaPublic.FALSE.value
    IGNORE = constants.UseCriteriaPublic.IGNORE.value
    TOKEN = strawberry.enum_value(
        constants.UseCriteriaPublic.TOKEN.value, description="Check only token"
    )


@strawberry.enum
class MetadataOperations(Enum):
    APPEND = constants.MetadataOperations.APPEND.value
    REMOVE = constants.MetadataOperations.REMOVE.value
    REPLACE = constants.MetadataOperations.REPLACE.value
