import enum
from dataclasses import dataclass

from rdflib import Namespace
from cryptography.hazmat.primitives import hashes

from .typings import ContentState

public_states: set[ContentState] = {
    "required",
    "trusted",
    "public",
}


# set here because ignored names are removed and must be manually set
# must be normal set to be extendable
protectedActions = {"storedUpdate", "auth"}


class DeleteRecursive(enum.Enum):
    _ignore_ = ["valid_values"]
    TRUE = "a"
    FALSE = "b"
    NO_GROUP = "c"


DeleteRecursive.valid_values: frozenset[str] = frozenset(
    map(lambda x: x.value, DeleteRecursive.__members__.values())
)


class ClaimState(enum.Enum):
    _ignore_ = ["valid_values"]
    UNVERIFIED = "a"
    DISPUTED = "b"
    VERIFIED = "c"
    VERIFIED_DISPUTED = "d"
    INDISPUTABLE = "e"


ClaimState.valid_values: frozenset[str] = frozenset(
    map(lambda x: x.value, ClaimState.__members__.values())
)


class UseCriteria(enum.Enum):
    _ignore_ = ["valid_values"]
    TRUE = "true"
    FALSE = "false"
    IGNORE = "ignore"


UseCriteria.valid_values: frozenset[str] = frozenset(
    map(lambda x: x.value, UseCriteria.__members__.values())
)


class UseCriteriaPublic(enum.Enum):
    _ignore_ = ["valid_values"]
    TRUE = "true"
    FALSE = "false"
    IGNORE = "ignore"
    TOKEN = "token"


UseCriteriaPublic.valid_values: frozenset[str] = frozenset(
    map(lambda x: x.value, UseCriteriaPublic.__members__.values())
)


class MetadataOperations(enum.Enum):
    _ignore_ = ["valid_values"]
    APPEND = "append"
    REMOVE = "remove"
    REPLACE = "replace"


MetadataOperations.valid_values: frozenset[str] = frozenset(
    map(lambda x: x.value, MetadataOperations.__members__.values())
)


@dataclass(frozen=True)
class HashNameItem:
    algorithm: hashes.HashAlgorithm
    serializedName: str


mapHashNames: dict[str, HashNameItem] = {
    "sha512": HashNameItem(algorithm=hashes.SHA512(), serializedName="sha512"),
    "SHA-512": HashNameItem(
        algorithm=hashes.SHA512(), serializedName="sha512"
    ),
    "sha256": HashNameItem(algorithm=hashes.SHA256(), serializedName="sha256"),
    "SHA-256": HashNameItem(
        algorithm=hashes.SHA256(), serializedName="sha256"
    ),
}


class TransferResult(enum.Enum):
    SUCCESS = "success"
    NOTFOUND = "notfound"
    ERROR = "error"
    FAILED_VERIFICATION = "failed_verification"


SECRETGRAPH = Namespace(
    "https://secretgraph.net/static/schemes/secretgraph/secretgraph#"
)
CLUSTER = Namespace(
    "https://secretgraph.net/static/schemes/secretgraph/cluster#"
)
SIMPLECONTENT = Namespace(
    "https://secretgraph.net/static/schemes/secretgraph/simplecontent#"
)
