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
class ShowElements(enum.Enum):
    __ignore__ = ["valide_values"]
    DEFAULT = "default"
    DELETED = "deleted"
    HIDDEN = "hidden"


ShowElements.valide_values = set(
    map(lambda x: x.value, ShowElements.__members__.values())
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
