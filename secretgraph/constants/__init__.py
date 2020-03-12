import enum

from rdflib import Namespace


class Action(enum.Enum):
    FETCH = 'fetch'
    UPDATE = 'update'
    VIEW = 'view'
    MANAGE = 'manage'
    STORED_DELETE = 'stored_delete'
    STORED_REPLACE = 'stored_replace'


sgraph_content = Namespace("/static/schemes/sgraph/content")
sgraph_component = Namespace("/static/schemes/sgraph/content")
