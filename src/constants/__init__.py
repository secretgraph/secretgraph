import enum


class Action(enum.Enum):
    FETCH = 'fetch'
    UPDATE = 'update'
    VIEW = 'view'
    MANAGE = 'manage'
    STORED_DELETE = 'stored_delete'
    STORED_REPLACE = 'stored_replace'
