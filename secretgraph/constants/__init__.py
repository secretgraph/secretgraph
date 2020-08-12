import enum

from rdflib import Namespace


class Action(enum.Enum):
    pass


class DeleteRecursive(enum.Enum):
    FALSE = False
    TRUE = True
    NO_GROUP = None


class MetadataOperations(enum.Enum):
    append = "append"
    remove = "remove"
    replace = "replace"


class TransferResult(enum.Enum):
    SUCCESS = "success"
    NOTFOUND = "notfound"
    ERROR = "error"
    FAILED_VERIFICATION = "failed_verification"


sgraph_secretgraph = Namespace("/static/schemes/secretgraph/secretgraph")
sgraph_cluster = Namespace("/static/schemes/secretgraph/cluster")
sgraph_simplecontent = Namespace("/static/schemes/secretgraph/simplecontent")
