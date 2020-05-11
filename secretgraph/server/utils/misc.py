
import hashlib
import base64

from django.conf import settings
from cryptography.hazmat.primitives import serialization
from ...constants import sgraph_cluster


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
    if hasattr(inp, "public_bytes"):
        inp = inp.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
            encryption_algorithm=serialization.NoEncryption()
        )
    algo.update(inp)
    return base64.b64encode(algo.digest()).decode("ascii")


def calculate_hashes(inp):
    if isinstance(inp, str):
        try:
            inp = base64.b64decode(inp)
        except Exception:
            inp = inp.encode("utf8")
    if hasattr(inp, "public_bytes"):
        inp = inp.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
            encryption_algorithm=serialization.NoEncryption()
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
        hashes.append(
            base64.b64encode(algo.digest()).decode("ascii")
        )
    return inp


def get_secrets(graph):
    public_secrets = []
    protected_secrets = {}
    # tasks must not be distinct
    for i in graph.query(
        """
        SELECT ?secret ?task
        WHERE {
            ?n a cluster:EncryptedBox ;
                cluster:EncryptedBox.secrets ?secret .
            OPTIONAL {  cluster:EncryptedBox.tasks ?task } .
        }
        """,
        initNs={
            "cluster": sgraph_cluster
        }
    ):
        if i.task:
            # hopefully the order is preserved
            protected_secrets.setdefault(i.secret, [])
            protected_secrets[i.secret].append(i.task)
        else:
            public_secrets.append(i.secret)
    return public_secrets, protected_secrets
