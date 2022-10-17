from asgiref.sync import sync_to_async
from django.conf import settings
from django.db.transaction import Atomic

from ...core.utils.hashing import hashObject, calculateHashes


class AsyncAtomic(Atomic):
    __aenter__ = sync_to_async(Atomic.__enter__, thread_sensitive=True)
    __aexit__ = sync_to_async(Atomic.__exit__, thread_sensitive=True)


def refresh_fields(inp, *fields):
    for i in inp:
        for field in fields:
            setattr(i, field, getattr(i, field))
        yield i


def hash_object(inp, algo=None):
    assert (
        len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0
    ), "no hash algorithms specified"
    if not algo:
        algo = settings.SECRETGRAPH_HASH_ALGORITHMS[0]

    return hashObject(inp, algo)


def calculate_hashes(inp):
    assert (
        len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0
    ), "no hash algorithms specified"
    return calculateHashes(
        inp, settings.SECRETGRAPH_HASH_ALGORITHMS, failhard=True
    )
