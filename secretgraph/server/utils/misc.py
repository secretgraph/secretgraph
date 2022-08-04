import hashlib
import base64

from asgiref.sync import sync_to_async
from django.conf import settings
from django.db.transaction import Atomic
from cryptography.hazmat.primitives import serialization


class AsyncAtomic(Atomic):
    __aenter__ = sync_to_async(Atomic.__enter__, thread_sensitive=True)
    __aexit__ = sync_to_async(Atomic.__exit__, thread_sensitive=True)


def refresh_fields(inp, *fields):
    for i in inp:
        for field in fields:
            setattr(i, field, getattr(i, field))
        yield i


def hash_object(inp, algo=None):
    if not algo:
        algo = settings.SECRETGRAPH_HASH_ALGORITHMS[0]
    if isinstance(algo, str):
        algo = hashlib.new(algo)
    elif callable(algo):
        algo = algo()
    else:
        algo = algo.copy()
    if isinstance(inp, str):
        try:
            inp = base64.b64decode(inp)
        except Exception:
            inp = inp.encode("utf8")
    if hasattr(inp, "public_key"):
        inp = inp.public_key()
    if hasattr(inp, "public_bytes"):
        inp = inp.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    algo.update(inp)
    return base64.b64encode(algo.digest()).decode("ascii")


def calculate_hashes(inp):
    assert (
        len(settings.SECRETGRAPH_HASH_ALGORITHMS) > 0
    ), "no hash algorithms specified"
    if isinstance(inp, str):
        try:
            inp = base64.b64decode(inp)
        except Exception:
            inp = inp.encode("utf8")
    if hasattr(inp, "public_key"):
        inp = inp.public_key()
    if hasattr(inp, "public_bytes"):
        inp = inp.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    hashes = []
    for algo in settings.SECRETGRAPH_HASH_ALGORITHMS:
        if isinstance(algo, str):
            algo = hashlib.new(algo)
        elif callable(algo):
            algo = algo()
        else:
            algo = algo.copy()
        algo.update(inp)
        hashes.append(base64.b64encode(algo.digest()).decode("ascii"))
    return hashes
