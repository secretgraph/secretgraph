from typing import Literal

Scope = Literal["manage", "create", "delete", "update", "push", "view"]
State = Literal["required", "trusted", "public", "internal", "draft"]

Hash = str
Action = str
