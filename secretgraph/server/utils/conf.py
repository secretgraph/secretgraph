from urllib.parse import urlsplit

from django.conf import settings
from django.http.request import validate_host

_default_allowed_hosts = ["localhost", "127.0.0.1", "[::1]"]


def inline_path(urlsplitted):
    allowed_hosts = settings.ALLOWED_HOSTS
    if settings.DEBUG and not allowed_hosts:
        allowed_hosts = _default_allowed_hosts
    if validate_host(urlsplitted.netloc, allowed_hosts):
        # first path parameter is host
        return urlsplitted.netloc or urlsplitted.path.split("/", 1)[0]
    return None


def get_httpx_params(url):
    """
    returns (httpx parameters, inline url or None)
    """
    urlsplitted = urlsplit(url)
    if "." in urlsplitted.netloc:
        tld = ".%s" % urlsplitted.netloc.rsplit(".")[1]
    else:
        tld = None
    mapper = settings.SECRETGRAPH_REQUEST_KWARGS_MAP
    return (
        mapper.get(urlsplitted.netloc, mapper[tld]),
        inline_path(urlsplitted),
    )
