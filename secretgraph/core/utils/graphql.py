import hashlib
import json
import math
from io import BytesIO, IOBase
from typing import List

import requests


def repeatOperation(
    operation, start=None, retries=math.inf, session=None
):
    if not session:
        session = requests.Session()
    counter = 0
    obj = start
    result = operation(obj, counter=counter, session=session)
    while result["writeok"] is False and counter < retries:
        counter += 1
        obj = result
        result = operation(obj, counter=counter, session=session)
    return result


def _transform_files(
    variables, mapper, files, counter=None, prefix="variables."
):
    if not counter:
        counter = [0]
    if isinstance(variables, dict):
        it = variables.items()
        retval = {}
        def appender(key, val): retval[key] = val
    else:
        it = enumerate(variables)
        retval = []
        def appender(key, val): retval.append(val)
    for key, val in it:
        if isinstance(val, bytes):
            val = BytesIO(val)
        if isinstance(val, IOBase):
            appender(key, None)
            files[str(counter[0])] = val
            mapper[str(counter[0])] = [f"{prefix}{key}"]
            counter[0] += 1
        elif isinstance(val, (list, tuple, dict)):
            result = _transform_files(
                val, mapper, files,
                counter=counter,
                prefix=f"{prefix}{key}."
            )
            appender(key, result)
        else:
            appender(key, val)
    return retval


# until gql supports files
def transform_payload(query, variables):
    files = {}
    mapper = {}
    newvars = _transform_files(variables, mapper, files)
    # hack for sending multipart
    if not files:
        files = {'stub': ('', 'content')}

    return {
        "operations": json.dumps({
            "query": query,
            "variables": newvars
        }),
        "map": json.dumps(mapper)
    }, files


def reset_files(files):
    for f in files.values():
        if hasattr(f, "seek"):
            f.seek(0)


def sortedHash(inp: List[str], algo: str):
    return hashlib.new(
        algo, b"".join(
            map(
                lambda x: x.encode("utf8"),
                sorted(inp)
            )
        )
    )
