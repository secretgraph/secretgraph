import strawberry
from typing import Annotated

from ... import constants


@strawberry.enum(description="Specify policy for recursive deletions")
class DeleteRecursive(constants.DeleteRecursive):
    TRUE: Annotated[
        str,
        strawberry.argument(
            description=(
                "Delete content when referenced content is deleted (default)"
            )
        ),
    ]
    FALSE: Annotated[
        str,
        strawberry.argument(
            description="Keep content when referenced content is deleted"
        ),
    ]
    NO_GROUP: Annotated[
        str,
        strawberry.argument(
            description=(
                "Delete content when referenced content is deleted and"
                "no other reference with the same group is remaining"
            )
        ),
    ]


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
class UseCriteria(constants.UseCriteria):
    pass


# TODO annotate fields with description as soon as possible
@strawberry.enum(description="Specify criteria")
class UseCriteriaPublic(constants.UseCriteriaPublic):
    TOKEN: Annotated[str, strawberry.argument(description="Check only token")]
