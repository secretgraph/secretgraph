import ratelimit
from django.conf import settings
from graphql import ExecutionResult as GraphQLExecutionResult
from graphql.error.graphql_error import GraphQLError
from strawberry.extensions import SchemaExtension
from strawberry.types import ExecutionContext
from strawberry.types.graphql import OperationType


class RatelimitMutations(SchemaExtension):
    def __init__(self, *, execution_context: ExecutionContext):
        self.rate = settings.SECRETGRAPH_RATELIMITS.get("GRAPHQL_MUTATIONS")
        super().__init__(execution_context=execution_context)

    # rate = "100/2s"

    def on_execute(self):
        should_be_ratelimited = bool(self.rate)
        if should_be_ratelimited:
            execution_context = self.execution_context
            if execution_context.operation_type == OperationType.MUTATION:
                r = ratelimit.get_ratelimit(
                    group="graphql_mutations",
                    request=execution_context.context["request"],
                    key="ip",
                    rate=self.rate,
                    action=ratelimit.Action.PEEK,
                )
                r.decorate_object(
                    execution_context.context["request"], "ratelimit"
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
                    return
            else:
                should_be_ratelimited = False
        yield
        if not should_be_ratelimited:
            return
        execution_context = self.execution_context
        data = execution_context.result and execution_context.result.data
        # only increase if no writeok with value False is found
        if data and any(
            map(
                lambda x: isinstance(x, dict)
                and x.get("writeok", None) is False,
                data.values(),
            )
        ):
            return
        ratelimit.get_ratelimit(
            group="graphql_mutations",
            key="ip",
            request=execution_context.context["request"],
            rate=self.rate,
            action=ratelimit.Action.INCREASE,
        )


class RatelimitErrors(SchemaExtension):
    rate = None

    def __init__(self, *, execution_context: ExecutionContext):
        if not settings.DEBUG:
            self.rate = settings.SECRETGRAPH_RATELIMITS.get("GRAPHQL_ERRORS")
        super().__init__(execution_context=execution_context)

    def on_execute(self):
        if self.rate:
            execution_context = self.execution_context
            r = ratelimit.get_ratelimit(
                group="graphql_errors",
                key="ip",
                request=execution_context.context["request"],
                rate=self.rate,
                action=ratelimit.Action.PEEK,
            )
            r.decorate_object(
                execution_context.context["request"], "ratelimit"
            )
            if r.request_limit >= 1:
                self.execution_context.result = GraphQLExecutionResult(
                    data=None,
                    errors=[
                        GraphQLError("Too many errors from ip, wait some time")
                    ],
                )
                return
        yield
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
