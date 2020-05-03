
import hashlib
import base64

from django.conf import settings


def hash_object(inp):
    if isinstance(inp, str):
        try:
            inp = base64.b64decode(inp)
        except Exception:
            inp = inp.encode("utf8")
    return base64.b64encode(
        hashlib.new(
            settings.SECRETGRAPH_HASH_ALGORITHMS[0],
            inp
        ).digest()
    ).decode("ascii")


def calculate_hashes(inp):
    hashes = []
    for algo in settings.SECRETGRAPH_HASH_ALGORITHMS:
        if isinstance(algo, str):
            algo = hashlib.new(algo)
        hashes.append(
            base64.b64encode(algo.update(inp).digest()).decode("ascii")
        )
    return inp
