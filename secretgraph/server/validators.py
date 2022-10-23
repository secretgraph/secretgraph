import re
from django.core.validators import RegexValidator

ClusterName_regex = re.compile(r"^(?:\S+ \S)*\S*?$")
ClusterNameValidator = RegexValidator(ClusterName_regex)

ActionKeyHash_regex = re.compile(r"^[^:]+:.+$")
ActionKeyHashValidator = RegexValidator(ActionKeyHash_regex)

ContentHash_regex = re.compile(r"^[^:]*:[-a-zA-Z0-9_/]+:[a-zA-Z0-9+/]+={0,2}$")
ContentHashValidator = RegexValidator(ContentHash_regex)
