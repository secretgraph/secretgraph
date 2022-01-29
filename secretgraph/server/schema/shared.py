import graphene

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


DeleteRecursive = graphene.Enum.from_enum(
    constants.DeleteRecursive, description=ReferenceInput_desc
)


def UseCriteria_desc(v):
    if v == constants.UseCriteria.FALSE:
        return "false"
    elif v == constants.UseCriteria.TRUE:
        return "true"
    elif v == constants.UseCriteria.IGNORE:
        return "Ignore"  # noqa: E501
    elif v is None:
        return "Specify criteria"
    else:
        raise Exception(f"Invalid type: {v}")


UseCriteria = graphene.Enum.from_enum(
    constants.UseCriteria, description=UseCriteria_desc
)
