import strawberry
from enum import Enum

from ... import constants


@strawberry.enum(description="Specify policy for recursive deletions")
class DeleteRecursive(str, Enum):
    TRUE = strawberry.enum_value(
        constants.DeleteRecursive.TRUE.value,
        description=(
            "Delete content when referenced " "content is deleted (default)"
        ),
    )
    FALSE = strawberry.enum_value(
        constants.DeleteRecursive.FALSE.value,
        description="Keep content when referenced content is deleted",
    )
    NO_GROUP = strawberry.enum_value(
        constants.DeleteRecursive.NO_GROUP.value,
        description=(
            "Delete content when referenced content is deleted and"
            "no other reference with the same group is remaining"
        ),
    )


@strawberry.enum(description="Specify criteria")
class UseCriteria(str, Enum):
    TRUE = constants.UseCriteria.TRUE.value
    FALSE = constants.UseCriteria.FALSE.value
    IGNORE = constants.UseCriteria.IGNORE.value


@strawberry.enum(description="Specify criteria")
class UseCriteriaPublic(str, Enum):
    TRUE = constants.UseCriteriaPublic.TRUE.value
    FALSE = constants.UseCriteriaPublic.FALSE.value
    IGNORE = constants.UseCriteriaPublic.IGNORE.value
    TOKEN = strawberry.enum_value(
        constants.UseCriteriaPublic.TOKEN.value, description="Check only token"
    )


@strawberry.enum
class MetadataOperations(str, Enum):
    append = constants.MetadataOperations.append.value
    remove = constants.MetadataOperations.remove.value
    replace = constants.MetadataOperations.replace.value
