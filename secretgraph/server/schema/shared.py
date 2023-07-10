from enum import Enum

import strawberry

from ...core import constants


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


# why not boolean? beause None can trigger an autodetect logic what is appropriate
@strawberry.enum(description="Specify criteria")
class UseCriteria(Enum):
    TRUE = constants.UseCriteria.TRUE.value
    FALSE = constants.UseCriteria.FALSE.value
    IGNORE = constants.UseCriteria.IGNORE.value


# here we have an extra case TOKEN
@strawberry.enum(description="Specify criteria")
class UseCriteriaPublic(Enum):
    TRUE = constants.UseCriteriaPublic.TRUE.value
    FALSE = constants.UseCriteriaPublic.FALSE.value
    IGNORE = constants.UseCriteriaPublic.IGNORE.value
    TOKEN = strawberry.enum_value(
        constants.UseCriteriaPublic.TOKEN.value,
        description="Only include resources with matching token, don't use public",
    )


@strawberry.enum
class MetadataOperations(Enum):
    APPEND = constants.MetadataOperations.APPEND.value
    REMOVE = constants.MetadataOperations.REMOVE.value
    REPLACE = constants.MetadataOperations.REPLACE.value
