from strawberry.extensions import Extension
from strawberry.types.graphql import OperationType
from graphql import ExecutionResult as GraphQLExecutionResult
from graphql.error.graphql_error import GraphQLError
import ratelimit


class RatelimitMutations(Extension):
    rate = "100/2s"

    def on_executing_start(self):
        execution_context = self.execution_context
        if execution_context.operation_type == OperationType.MUTATION:
            r = ratelimit.get_ratelimit(
                group="graphql_update",
                key="ip",
                rate=self.rate,
                action=ratelimit.Action.PEEK,
            )
            if r.request_limit >= 1:
                self.execution_context.result = GraphQLExecutionResult(
                    data=None,
                    errors=[
                        GraphQLError(
                            "Too many updates from ip, wait some time"
                        )
                    ],
                )

    def on_executing_end(self):
        data = self.execution_context.data

        if data and any(
            map(lambda x: x.get("writeok", None) is False, data.values())
        ):
            return
        ratelimit.get_ratelimit(
            group="graphql_update",
            key="ip",
            rate=self.rate,
            action=ratelimit.Action.INCREASE,
        )


class RatelimitErrors(Extension):
    rate = "20/4m"

    def on_executing_start(self):
        r = ratelimit.get_ratelimit(
            group="graphql_errors",
            key="ip",
            rate=self.rate,
            action=ratelimit.Action.PEEK,
        )
        if r.request_limit >= 1:
            self.execution_context.result = GraphQLExecutionResult(
                data=None,
                errors=[
                    GraphQLError("Too many errors from ip, wait some time")
                ],
            )

    def on_executing_end(self):
        if not self.execution_context.errors:
            return
        ratelimit.get_ratelimit(
            group="graphql_errors",
            key="ip",
            rate=self.rate,
            action=ratelimit.Action.INCREASE,
        )
