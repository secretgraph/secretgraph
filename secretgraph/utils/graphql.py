import math
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


def updateOrCreateCluster(obj, counter):
    if counter >= 1:
        obj = obj["cluster"]
