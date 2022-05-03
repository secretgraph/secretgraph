import strawberry
from enum import Enum
from typing import Annotated

from ... import constants


@strawberry.enum(description="Specify policy for recursive deletions")
class DeleteRecursive(Enum):
    TRUE: Annotated[
        str,
        strawberry.argument(
            description=(
                "Delete content when referenced content is deleted (default)"
            )
        ),
    ] = constants.DeleteRecursive.TRUE.value
    FALSE: Annotated[
        str,
        strawberry.argument(
            description="Keep content when referenced content is deleted"
        ),
    ] = constants.DeleteRecursive.FALSE.value
    NO_GROUP: Annotated[
        str,
        strawberry.argument(
            description=(
                "Delete content when referenced content is deleted and"
                "no other reference with the same group is remaining"
            )
        ),
    ] = constants.DeleteRecursive.NO_GROUP.value


def UseCriteria_desc(v):
    if (
        v == constants.UseCriteria.FALSE
        or v == constants.UseCriteriaPublic.FALSE
    ):
        return "false"
    elif (
        v == constants.UseCriteria.TRUE
        or v == constants.UseCriteriaPublic.TRUE
    ):
        return "true"
    elif v == constants.UseCriteriaPublic.TOKEN:
        return "Check only Token"  # noqa: E501
    elif (
        v == constants.UseCriteria.IGNORE
        or v == constants.UseCriteriaPublic.IGNORE
    ):
        return "Ignore"  # noqa: E501
    elif v is None:
        return "Specify criteria"
    else:
        raise Exception(f"Invalid type: {v}")


# TODO annotate fields with description as soon as possible
@strawberry.enum(description="Specify criteria")
class UseCriteria(Enum):
    TRUE = constants.UseCriteria.TRUE.value
    FALSE = constants.UseCriteria.FALSE.value
    IGNORE = constants.UseCriteria.IGNORE.value


# TODO annotate fields with description as soon as possible
@strawberry.enum(description="Specify criteria")
class UseCriteriaPublic(Enum):
    TRUE = constants.UseCriteriaPublic.TRUE.value
    FALSE = constants.UseCriteriaPublic.FALSE.value
    IGNORE = constants.UseCriteriaPublic.IGNORE.value
    TOKEN: Annotated[
        str, strawberry.argument(description="Check only token")
    ] = constants.UseCriteriaPublic.TOKEN.value


@strawberry.enum
class MetadataOperations(Enum):
    append = constants.MetadataOperations.append.value
    remove = constants.MetadataOperations.remove.value
    replace = constants.MetadataOperations.replace.value
