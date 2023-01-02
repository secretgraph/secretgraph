from strawberry.extensions import Extension
from strawberry.types.graphql import OperationType
from graphql import ExecutionResult as GraphQLExecutionResult
from graphql.error.graphql_error import GraphQLError
import ratelimit


class RatelimitMutations(Extension):
    def on_executing_start(self):
        execution_context = self.execution_context
        if execution_context.operation_type == OperationType.MUTATION:
            r = ratelimit.get_ratelimit(
                group="graphql_update",
                key="ip",
                rate="50/s",
                action=ratelimit.Action.INCREASE,
            )
            if r.request_limit >= 1:
                self.execution_context.result = GraphQLExecutionResult(
                    data=None,
                    errors=[GraphQLError("Too many updates from ip")],
                )


class RatelimitNonMutations(Extension):
    def on_executing_start(self):
        execution_context = self.execution_context
        if execution_context.operation_type != OperationType.MUTATION:
            r = ratelimit.get_ratelimit(
                group="graphql_view",
                key="ip",
                rate="4000/s",
                action=ratelimit.Action.INCREASE,
            )
            if r.request_limit >= 1:
                self.execution_context.result = GraphQLExecutionResult(
                    data=None,
                    errors=[
                        GraphQLError(
                            "Too many query/subscription requests from ip"
                        )
                    ],
                )
