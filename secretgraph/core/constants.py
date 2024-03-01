import enum
import re
import string

from rdflib import Namespace

from .typings import ContentState

# for locking down strings but allowing ip addresses and most urls. Currently not in use
safe_chars = frozenset(
    [*string.ascii_letters, *string.digits, *"!#%&*+,-./:;=?@\\[]^_`|~"]
)
safe_chars_re = re.compile(r"[a-zA-Z0-9!#%&*+,-./:;=?@\\[\]^_`|~]*")

public_states: set[ContentState] = {
    "required",
    "trusted",
    "public",
}
nonkey_content_states: set[ContentState] = {
    "public",
    "protected",
    "sensitive",
    "draft",
}
publickey_states: set[ContentState] = {
    "public",
    "protected",
    "required",
    "trusted",
}

storedUpdateFields = {
    "Cluster": {
        # "name": str,
        "description": str,
        # "featured": bool,
    },
    "Content": {
        "tags": list[str],
        "state": ContentState,
        "hidden": bool,
    },
    "Action": {"start", "stop"},
}

# set here because ignored names are removed and must be manually set
# must be normal set to be extendable
protectedActions = {"storedUpdate", "auth"}
protectedTypes = {"Config", "PrivateKey"}
keyTypes = {"PublicKey", "PrivateKey"}


class DeleteRecursive(enum.StrEnum):
    _ignore_ = ["valid_values"]
    valid_values: frozenset[str]
    TRUE = "a"
    FALSE = "b"
    NO_GROUP = "c"


DeleteRecursive.valid_values = frozenset(
    map(lambda x: x.value, DeleteRecursive.__members__.values())
)


class UserSelectable(enum.StrEnum):
    _ignore_ = ["valid_values"]
    valid_values: frozenset[str]
    NONE = "a"
    UNRESTRICTED = "b"
    SELECTABLE = "c"
    DESELECTABLE = "d"
    # like UNRESTRICTED but only when creating a cluster or net
    INITIAL_MODIFYABLE = "e"


UserSelectable.valid_values = frozenset(
    map(lambda x: x.value, UserSelectable.__members__.values())
)


class ClaimState(enum.StrEnum):
    _ignore_ = ["valid_values"]
    valid_values: frozenset[str]
    UNVERIFIED = "a"
    DISPUTED = "b"
    VERIFIED = "c"
    VERIFIED_DISPUTED = "d"
    INDISPUTABLE = "e"


ClaimState.valid_values = frozenset(
    map(lambda x: x.value, ClaimState.__members__.values())
)


class UseCriteria(enum.StrEnum):
    _ignore_ = ["valid_values"]
    valid_values: frozenset[str]
    TRUE = "true"
    FALSE = "false"
    IGNORE = "ignore"


UseCriteria.valid_values = frozenset(
    map(lambda x: x.value, UseCriteria.__members__.values())
)


class UseCriteriaPublic(enum.StrEnum):
    _ignore_ = ["valid_values"]
    valid_values: frozenset[str]
    TRUE = "true"
    FALSE = "false"
    IGNORE = "ignore"
    TOKEN = "token"


UseCriteriaPublic.valid_values = frozenset(
    map(lambda x: x.value, UseCriteriaPublic.__members__.values())
)


class MetadataOperations(enum.StrEnum):
    _ignore_ = ["valid_values"]
    valid_values: frozenset[str]
    APPEND = "append"
    REMOVE = "remove"
    REPLACE = "replace"


MetadataOperations.valid_values = frozenset(
    map(lambda x: x.value, MetadataOperations.__members__.values())
)


class TransferResult(enum.Enum):
    SUCCESS = "success"
    NOTFOUND = "notfound"
    ERROR = "error"
    NONRECOVERABLE_ERROR = "nonrecoverable_error"
    FAILED_VERIFICATION = "failed_verification"
    RESOURCE_LIMIT_EXCEEDED = "resource_limit_exceeded"


SECRETGRAPH = Namespace(  # pyonly
    "https://secretgraph.net/static/schemes/secretgraph/secretgraph#"
)
CLUSTER = Namespace(  # pyonly
    "https://secretgraph.net/static/schemes/secretgraph/cluster#"
)
SIMPLECONTENT = Namespace(  # pyonly
    "https://secretgraph.net/static/schemes/secretgraph/simplecontent#"
)
