import re
from django.core.validators import RegexValidator

clusterName_regex = re.compile(r"^(?:\S+ \S)*\S*?$")
ClusterNameValidator = RegexValidator(clusterName_regex)
