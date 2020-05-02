import json
from typing import Iterable


class FakeList(list):
    def __init__(self, l):
        self.inner = l
        super().__init__()

    def __iter__(self):
        return iter(self.inner)

    def __bool__(self):
        return bool(self.inner)


class IterJsonEncoder(json.JSONEncoder):

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def default(self, obj):
        if isinstance(obj, Iterable):
            return FakeList(obj)
        return super().default(obj)
