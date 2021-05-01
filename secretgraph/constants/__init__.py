import enum

from rdflib import Namespace


class Action(enum.Enum):
    pass


class DeleteRecursive(enum.Enum):
    __ignore__ = ["valide_values"]
    TRUE = "a"
    FALSE = "b"
    NO_GROUP = "c"


DeleteRecursive.valide_values = set(
    map(lambda x: x.value, DeleteRecursive.__members__.values())
)


# not active yet
class ShowDeleted(enum.Enum):
    __ignore__ = ["valide_values"]
    false = "false"
    true = "true"
    both = "both"


ShowDeleted.valide_values = set(
    map(lambda x: x.value, ShowDeleted.__members__.values())
)


class MetadataOperations(enum.Enum):
    append = "append"
    remove = "remove"
    replace = "replace"


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
