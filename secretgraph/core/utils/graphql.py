import math

from gql import Client
from gql.transport.websockets import WebsocketsTransport
from gql.transport.aiohttp import AIOHTTPTransport


def create_client(url, headers={}) -> Client:
    if url.startswith("wss") or url.startswith("ws"):
        transport = WebsocketsTransport(url, headers=headers)
    else:
        transport = AIOHTTPTransport(url, headers=headers)

    return Client(
        transport=transport,
        fetch_schema_from_transport=True,
    )


def repeatOperation(
    operation, writeokKey, session, start=None, retries=math.inf
):
    counter = 0
    obj = start
    result = operation(obj, counter=counter, session=session)
    while result[writeokKey]["writeok"] is False and counter < retries:
        counter += 1
        obj = result
        result = operation(obj, counter=counter, session=session)
    return result
