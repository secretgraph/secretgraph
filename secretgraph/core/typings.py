from typing import TypeVar, Literal, TypeAlias

Scope = TypeVar(
    "Scope", Literal["manage", "create", "delete", "update", "push", "view"]
)
State = TypeVar(
    "State", Literal["required", "trusted", "public", "internal", "draft"]
)


Hash = TypeAlias(str)
Action = TypeAlias(str)
