class ResourceLimitExceeded(Exception):
    """Exceeded a resource limit"""


class LockedResourceError(Exception):
    """Resource is locked"""


class VerificationFailedError(Exception):
    """Resource verification failed"""
