from asgiref.sync import sync_to_async
from django.db.transaction import Atomic


class AsyncAtomic(Atomic):
    __aenter__ = sync_to_async(Atomic.__enter__, thread_sensitive=True)
    __aexit__ = sync_to_async(Atomic.__exit__, thread_sensitive=True)


def refresh_fields(inp, *fields):
    for i in inp:
        for field in fields:
            setattr(i, field, getattr(i, field))
        yield i
