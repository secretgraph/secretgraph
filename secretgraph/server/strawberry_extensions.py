from strawberry.extensions import Extension
from strawberry.types.graphql import OperationType, ExecutionContext
from graphql import ExecutionResult as GraphQLExecutionResult
from graphql.error.graphql_error import GraphQLError
import ratelimit


from django.conf import settings


class RatelimitMutations(Extension):
    def __init__(self, *, execution_context: ExecutionContext):
        self.rate = settings.SECRETGRAPH_RATELIMITS.get("GRAPHQL_MUTATIONS")
        super().__init__(execution_context=execution_context)

    # rate = "100/2s"

    def on_executing_start(self):
        if not self.rate:
            return
        execution_context = self.execution_context
        if execution_context.operation_type == OperationType.MUTATION:
            r = ratelimit.get_ratelimit(
                group="graphql_mutations",
                request=execution_context.context["request"],
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
        if not self.rate:
            return
        execution_context = self.execution_context
        data = execution_context.result and execution_context.result.data
        # only increase if no writeok with value False is found
        if data and any(
            map(lambda x: x.get("writeok", None) is False, data.values())
        ):
            return
        ratelimit.get_ratelimit(
            group="graphql_mutations",
            key="ip",
            request=execution_context.context["request"],
            rate=self.rate,
            action=ratelimit.Action.INCREASE,
        )


class RatelimitErrors(Extension):
    rate = None

    def __init__(self, *, execution_context: ExecutionContext):
        if not settings.DEBUG:
            self.rate = settings.SECRETGRAPH_RATELIMITS.get("GRAPHQL_ERRORS")
        super().__init__(execution_context=execution_context)

    def on_executing_start(self):
        if not self.rate:
            return
        execution_context = self.execution_context
        r = ratelimit.get_ratelimit(
            group="graphql_errors",
            key="ip",
            request=execution_context.context["request"],
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
        if not self.rate:
            return
        execution_context = self.execution_context
        if not execution_context.errors:
            return
        ratelimit.get_ratelimit(
            group="graphql_errors",
            key="ip",
            request=execution_context.context["request"],
            rate=self.rate,
            action=ratelimit.Action.INCREASE,
        )
