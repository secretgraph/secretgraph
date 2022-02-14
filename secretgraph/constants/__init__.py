import enum

from rdflib import Namespace


class Action(enum.Enum):
    _ignore_ = ["protected_values", "valid_values"]
    AUTH = "auth"
    CREATE = "create"
    VIEW = "view"
    DELETE = "delete"
    UPDATE = "update"
    PUSH = "push"
    MANAGE = "manage"
    STORED_UPDATE = "storedUpdate"


# set here because ignored names are removed and must be manually set
# must be normal set to be extendable
Action.protected_values = {"storedUpdate", "auth"}
# must be normal set to be extendable
Action.valid_values = set(map(lambda x: x.value, Action.__members__.values()))


class DeleteRecursive(enum.Enum):
    _ignore_ = ["valid_values"]
    TRUE = "a"
    FALSE = "b"
    NO_GROUP = "c"


DeleteRecursive.valid_values = frozenset(
    map(lambda x: x.value, DeleteRecursive.__members__.values())
)


class UseCriteria(enum.Enum):
    _ignore_ = ["valid_values"]
    TRUE = "true"
    FALSE = "false"
    IGNORE = "ignore"


UseCriteria.valid_values = frozenset(
    map(lambda x: x.value, UseCriteria.__members__.values())
)


class UseCriteriaPublic(enum.Enum):
    _ignore_ = ["valid_values"]
    TRUE = "true"
    FALSE = "false"
    IGNORE = "ignore"
    TOKEN = "token"


UseCriteriaPublic.valid_values = frozenset(
    map(lambda x: x.value, UseCriteriaPublic.__members__.values())
)


class MetadataOperations(enum.Enum):
    _ignore_ = ["valid_values"]
    append = "append"
    remove = "remove"
    replace = "replace"


MetadataOperations.valid_values = frozenset(
    map(lambda x: x.value, MetadataOperations.__members__.values())
)


class TransferResult(enum.Enum):
    SUCCESS = "success"
    NOTFOUND = "notfound"
    ERROR = "error"
    FAILED_VERIFICATION = "failed_verification"


SECRETGRAPH = Namespace(
    "https://secretgraph.net/static/schemes/secretgraph/secretgraph#"
)
CLUSTER = Namespace(
    "https://secretgraph.net/static/schemes/secretgraph/cluster#"
)
SIMPLECONTENT = Namespace(
    "https://secretgraph.net/static/schemes/secretgraph/simplecontent#"
)
