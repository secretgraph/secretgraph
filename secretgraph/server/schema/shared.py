import strawberry

from ... import constants


def ReferenceInput_desc(v):
    if v == constants.DeleteRecursive.FALSE:
        return "Keep content when referenced content is deleted"
    elif v == constants.DeleteRecursive.TRUE:
        return "Delete content when referenced content is deleted (default)"
    elif v == constants.DeleteRecursive.NO_GROUP:
        return "Delete content when referenced content is deleted and no other reference with the same group is remaining"  # noqa: E501
    elif v is None:
        return "Specify policy for recursive deletions"
    else:
        raise Exception(f"Invalid type: {v}")


# TODO annotate fields with description as soon as possible
@strawberry.enum(description=ReferenceInput_desc())
class DeleteRecursive(constants.DeleteRecursive):
    pass


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
@strawberry.enum(description=UseCriteria_desc())
class UseCriteria(constants.UseCriteria):
    pass


# TODO annotate fields with description as soon as possible
@strawberry.enum(description=UseCriteria_desc())
class UseCriteriaPublic(constants.UseCriteriaPublic):
    pass
