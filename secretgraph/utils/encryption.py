__all__ = ["EncryptedContents"]


import base64
import json
import logging
import os
from urllib.parse import parse_qs, urlencode

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from rdflib import Graph
from spkcspider.constants import spkcgraph
from spkcspider.utils.urls import merge_get_url, replace_action

from spider_messaging.constants import (
     AttestationResult
)
from spider_messaging.exceptions import HttpError
from spider_messaging.utils.graph import (
    extract_property, get_pages, map_keys
)
from spider_messaging.utils.misc import EncryptedFile

logger = logging.getLogger(__name__)

success_states = {
    AttestationResult.success,
    AttestationResult.partial_success
}


class EncryptedContents(object):
    keys = None

    def __init__(self, priv_keys, session=None):
        if not isinstance(priv_keys, (list, tuple)):
            priv_keys = [priv_keys]
        self.keys = []
        for k in priv_keys:
            self.keys.append((
                k.public_key().public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo
                ).strip(),
                k
            ))

    @classmethod
    def retrieve_missing(
        cls, graph_or_url, filters=None, x_token=None, timeout=60, session=None
    ):
        if not session:
            session = requests.Session()
        if isinstance(graph_or_url, "str"):
            assert filters is None, "No filters specified and url given"
            graph = cls.retrieve_filtered_graph(
                graph_or_url, filters,
                x_token=x_token, timeout=timeout, session=session
            )
        else:
            graph = graph_or_url
        retrieved_url, missing_pages = get_pages(graph)
        for page in missing_pages:
            with session.get(
                merge_get_url(retrieved_url, page=page), headers={
                    "X-TOKEN": x_token or ""
                },
                timeout=timeout
            ) as response:
                response.raise_for_status()
                graph.parse(data=response.content, format="turtle")
        return graph, retrieved_url

    @staticmethod
    def retrieve_filtered_graph(
        url, filters, x_token=None, timeout=60, session=None
    ):
        if not session:
            session = requests.Session()
        splitted = url.split("?", 1)
        if len(splitted) == 2:
            GET = parse_qs(splitted[1])
            # always returns a list if available
            search = set(GET.get("search", []))
            search.update(filters)
            GET["search"] = list(search)
            url = f"{splitted[0]}?{urlencode(GET, doseq=True)}"
        graph = Graph()
        with session.get(
            url,
            headers={
                "X-TOKEN": x_token or ""
            }, timeout=timeout
        ) as response:
            response.raise_for_status()
            graph.parse(data=response.content, format="turtle")
        return graph

    @staticmethod
    def extract_content_data(
        graph, ref, multimap, get_token=None, x_token=None, timeout=60,
        session=None
    ):
        pass

    def reencrypt(self, inp, x_token=None, timeout=60, session=None):
        """
        [summary]

        Arguments:
            inp {url,graph} -- [description]

        Keyword Arguments:
            x_token {[type]} -- [description] (default: {None})
            timeout {int} -- [description] (default: {60})
            session {[type]} -- [description] (default: {None})
        """
        if not session:
            session = requests.Session()
        graph, url = self.retrieve_missing(
            inp, ["\x1etype=PublicKey\x1e", "\x1eencrypted\x1e"],
            x_token=x_token, timeout=timeout, session=session
        )
        public_keys = {}
        public_keys["all"], hash_algo = map_keys(graph)
        public_keys["all"] = public_keys["all"].values()
        public_keys = {
            "thirdparty": filter(
                lambda x: not x.get("thirdparty"),
                public_keys["all"]
            )
        }
        # TODO: find postboxes and connect with keys
        for k in list(public_keys.keys()):
            public_keys[k] = list(map(lambda x: x["pubkey"], public_keys[k]))
        multimap = {}
        hash_algos = set(extract_property(graph, "hash_algorithm").values())
        for h in hash_algos:
            algo = getattr(hashes, h.upper())
            for pub, k in self.keys:
                digest = hashes.Hash(algo)
                digest.update(pub)
                digest = digest.finalize().hex()
                multimap[f"{algo.name}={digest}"] = k

        for i in graph.query(
            """
            SELECT ?uri ?info ?spkctype
            WHERE {
                ?uri spkc:type ?spkctype ;
                     spkc:properties ?prop .
                ?prop spkc:name ?info_name ;
                      spkc:value "info" .
                FILTER CONTAINS(?info, "\x1eencrypted\x1e")
            }
            """,
            initNs={"spkc": spkcgraph}
        ):
            if "\x1eunlisted\x1e" in i.info:
                ks = public_keys["thirdparty"]
            else:
                ks = public_keys["all"]
            newob = self.extract_content_data(
                graph, i.uri, multimap,
                timeout=timeout, x_token=x_token, session=session
            )
            self.update_content(
                ks, i.uri, newob, get_token=get_token,
                x_token=x_token, timeout=x_token, session=session,
                hash_algo=hash_algo
            )

    def update_content(
        self, inp, newob, update_url=None,
        x_token=None, timeout=60, session=None, hash_algo=None
    ):
        """
        [summary]

        Arguments:
            inp {url,graph,keys} -- [description]
            update_url {[type]} -- [description]
            newob {[type]} -- [description]

        Keyword Arguments:
            x_token {[type]} -- [description] (default: {None})
            timeout {int} -- [description] (default: {60})
            session {[type]} -- [description] (default: {None})
            hash_algo {} -- (default: {None})
        """
        if not session:
            session = requests.Session()
        if isinstance(inp, (list, tuple)):
            # be careful to not include thirdparty keys if incompatible
            keys = set(inp)
            assert hash_algo and update_url
        else:
            graph, update_url = self.retrieve_missing(
                inp, ["\x1etype=PublicKey\x1e"],
                x_token=x_token, timeout=timeout, session=session
            )
            info = extract_property(graph)
            allow_thirdparty = "\x1eunlisted\x1e" not in info
            keys, hash_algo = map_keys(
                graph, hash_algo=hash_algo or None
            )
            if not allow_thirdparty:
                keys = filter(
                    lambda x: x["thirdparty"],
                    keys.values()
                )
            keys = list(map(lambda x: x["pubkey"], keys))

        update_url = replace_action(update_url, "update/")
        update_graph = self.retrieve_missing(
            update_url, [], x_token=None, timeout=timeout, session=session
        )
        csrftoken = list(update_graph.objects(
            predicate=spkcgraph["csrftoken"])
        )[0].toPython()

        body = dict(newob["unencrypted"]["values"])
        files = dict(newob["unencrypted"]["files"])
        nonce = os.urandom(13)
        nonce_b64 = base64.b64encode(nonce)
        aes_key = newob.get("aes_key") or os.urandom(32)
        nonce_name = newob.get("nonce_name")
        key_list_name = newob.get("key_list_name", "key_list")
        body[nonce_name] = nonce

        cipher = Cipher(
            algorithms.AES(aes_key),
            modes.GCM(nonce)
        )
        for k, item in newob["encrypted"]["values"].items():
            assert nonce_name != k
            e = cipher.encryptor()
            if not isinstance(item, (list, set, tuple)):
                item = [item]
            body[k] = []
            for el in item:
                if isinstance(el, str):
                    el = el.encode("utf8")
                el = e.update(el)
                if not nonce_name:
                    el = b"%s\0%s" % (
                        nonce_b64, el
                    )
                body[k].append(el)

        for k, item in newob["encrypted"]["files"].items():
            assert nonce_name != k
            files[k] = EncryptedFile(
                cipher.encryptor(), item,
                nonce=nonce if nonce_name else None
            )
        body[key_list_name] = {}

        for k in keys:
            enc = k[1].encrypt(
                aes_key,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hash_algo),
                    algorithm=hash_algo, label=None
                )
            )
            # encrypt decryption key
            body[key_list_name][
                "%s=%s" % (hash_algo.name, k[0].hex())
            ] = base64.b64encode(enc).decode("ascii")
        body[key_list_name] = json.dumps(body[key_list_name])
        # create message object
        response = session.post(
            update_url, data=body, headers={
                "X-CSRFToken": csrftoken,
            },
            files=files
        )
        try:
            response.raise_for_status()
        except Exception as exc:
            raise HttpError(
                "Message creation failed", response.text
            ) from exc
