import enum

from rdflib import Namespace


class Action(enum.Enum):
    FETCH = 'fetch'
    UPDATE = 'update'
    VIEW = 'view'
    MANAGE = 'manage'
    STORED_DELETE = 'stored_delete'
    STORED_REPLACE = 'stored_replace'


class DeleteRecursive(enum.Enum):
    FALSE = False
    TRUE = True
    NO_GROUP = None


sgraph_key = Namespace("/static/schemes/sgraph/key")
sgraph_component = Namespace("/static/schemes/sgraph/component")
sgraph_simplecontent = Namespace("/static/schemes/sgraph/simplecontent")
