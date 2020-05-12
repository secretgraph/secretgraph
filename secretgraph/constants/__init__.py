import enum

from rdflib import Namespace


class Action(enum.Enum):
    pass


class DeleteRecursive(enum.Enum):
    FALSE = False
    TRUE = True
    NO_GROUP = None


class TransferResult(enum.Enum):
    SUCCESS = "success"
    NOTFOUND = "notfound"
    ERROR = "error"


sgraph_cluster = Namespace("/static/schemes/sgraph/cluster")
sgraph_simplecontent = Namespace("/static/schemes/sgraph/simplecontent")
