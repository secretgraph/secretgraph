from functools import wraps
from inspect import iscoroutinefunction


def no_opener(view_func):
    """
    Decorator that adds headers to a response so it
    doesn't add an opener attribute to cross-origins
    """
    fntocheck = view_func
    if hasattr(fntocheck, "func"):
        fntocheck = fntocheck.func
    if hasattr(fntocheck, "__func__"):
        fntocheck = fntocheck.__func__
    if iscoroutinefunction(fntocheck):

        @wraps(view_func)
        async def _wrapped_view_func(request, *args, **kwargs):
            # Ensure argument looks like a request.
            if not hasattr(request, "META"):
                raise TypeError(
                    "no_opener didn't receive an HttpRequest. If you are "
                    "decorating a classmethod, be sure to use"
                    "@method_decorator."
                )
            response = await view_func(request, *args, **kwargs)
            response["Cross-Origin-Opener-Policy"] = "same-origin"
            return response

    else:

        @wraps(view_func)
        def _wrapped_view_func(request, *args, **kwargs):
            # Ensure argument looks like a request.
            if not hasattr(request, "META"):
                raise TypeError(
                    "no_opener didn't receive an HttpRequest. If you are "
                    "decorating a classmethod, be sure to use "
                    "@method_decorator."
                )
            response = view_func(request, *args, **kwargs)
            response["Cross-Origin-Opener-Policy"] = "same-origin"
            return response

    return _wrapped_view_func


def add_secretgraph_headers(view_func):
    """ """

    from django.conf import settings
    from django.shortcuts import resolve_url

    def _patch_secretgraph_headers(response):
        response["X-HASH-ALGORITHMS"] = ",".join(
            settings.SECRETGRAPH_HASH_ALGORITHMS
        )
        response["X-GRAPHQL-PATH"] = resolve_url(
            getattr(settings, "SECRETGRAPH_GRAPHQL_PATH", "/graphql/")
        )

    fntocheck = view_func
    if hasattr(fntocheck, "func"):
        fntocheck = fntocheck.func
    if hasattr(fntocheck, "__func__"):
        fntocheck = fntocheck.__func__
    if iscoroutinefunction(fntocheck):

        @wraps(view_func)
        async def _wrapped_view_func(request, *args, **kwargs):
            # Ensure argument looks like a request.
            if not hasattr(request, "META"):
                raise TypeError(
                    "add_secretgraph_headers didn't receive an HttpRequest. If you are "  # noqa: E501
                    "decorating a classmethod, be sure to use "
                    "@method_decorator."
                )
            response = await view_func(request, *args, **kwargs)
            _patch_secretgraph_headers(response)
            return response

    else:

        @wraps(view_func)
        def _wrapped_view_func(request, *args, **kwargs):
            # Ensure argument looks like a request.
            if not hasattr(request, "META"):
                raise TypeError(
                    "add_secretgraph_headers didn't receive an HttpRequest. If you are "  # noqa: E501
                    "decorating a classmethod, be sure to use "
                    "@method_decorator."
                )
            response = view_func(request, *args, **kwargs)
            _patch_secretgraph_headers(response)
            return response

    return _wrapped_view_func


def _patch_cors_headers(request, response):
    response["Access-Control-Allow-Origin"] = "*"
    if request.method == "OPTIONS":
        # copy from allow
        response["Access-Control-Allow-Methods"] = response["Allow"]


def add_cors_headers(view_func):
    fntocheck = view_func
    if hasattr(fntocheck, "func"):
        fntocheck = fntocheck.func
    if hasattr(fntocheck, "__func__"):
        fntocheck = fntocheck.__func__

    if iscoroutinefunction(fntocheck):

        @wraps(view_func)
        async def _wrapped_view_func(request, *args, **kwargs):
            # Ensure argument looks like a request.
            if not hasattr(request, "META"):
                raise TypeError(
                    "add_cors_headers didn't receive an HttpRequest. If you are "  # noqa: E501
                    "decorating a classmethod, be sure to use "
                    "@method_decorator."
                )
            response = await view_func(request, *args, **kwargs)
            _patch_cors_headers(request, response)
            return response

    else:

        @wraps(view_func)
        def _wrapped_view_func(request, *args, **kwargs):
            # Ensure argument looks like a request.
            if not hasattr(request, "META"):
                raise TypeError(
                    "add_cors_headers didn't receive an HttpRequest. If you are "  # noqa: E501
                    "decorating a classmethod, be sure to use "
                    "@method_decorator."
                )
            response = view_func(request, *args, **kwargs)
            return response

    return _wrapped_view_func
