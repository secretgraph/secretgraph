import re

from django.utils.deconstruct import deconstructible
from django.core.validators import RegexValidator

ClusterName_regex = re.compile(r"^(?:\S+ \S)*\S*?$")


@deconstructible
class ClusterNameValidator(RegexValidator):
    def __init__(
        self,
    ) -> None:
        super().__init__(ClusterName_regex)


ActionKeyHash_regex = re.compile(r"^[^:\s]+:.+$")


@deconstructible
class ActionKeyHashValidator(RegexValidator):
    def __init__(
        self,
    ) -> None:
        super().__init__(ActionKeyHash_regex)


ContentHash_regex = re.compile(
    r"^[^:\s]*:[-a-zA-Z0-9_/]+:[a-zA-Z0-9+/]+={0,2}$"
)


@deconstructible
class ContentHashValidator(RegexValidator):
    def __init__(
        self,
    ) -> None:
        super().__init__(ContentHash_regex)


TypeAndGroup_regex = re.compile(r"^[^:\s]*$")


@deconstructible
class TypeAndGroupValidator(RegexValidator):
    def __init__(
        self,
    ) -> None:
        super().__init__(TypeAndGroup_regex)
