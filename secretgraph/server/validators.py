import re

from django.core.validators import RegexValidator
from django.utils.deconstruct import deconstructible

SafeName_regex = re.compile(r"^(?:\S+ \S)*\S*?$")


@deconstructible
class SafeNameValidator(RegexValidator):
    def __init__(
        self,
    ) -> None:
        super().__init__(SafeName_regex)


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


# comma is used for templatetag seperation, so disallow it here
TypeAndGroup_regex = re.compile(r"^[^:\s,]*$")


@deconstructible
class TypeAndGroupValidator(RegexValidator):
    def __init__(
        self,
    ) -> None:
        super().__init__(TypeAndGroup_regex)
