__all__ = ["PostBox"]

import base64
import io
import json
import logging
import os
import hashlib
import tempfile
from email import parser as emailparser
from email import policy
from urllib.parse import parse_qs

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from rdflib import XSD, Graph, Literal, URIRef

from ..constants import (
    AccessMethod,
    AttestationResult,
    MessageType,
    SendMethod,
)
from ..exceptions import (
    CheckError,
    DestException,
    DestSecurityException,
    NotReady,
    SrcException,
    ValidationError,
    WrongRecipient,
)

logger = logging.getLogger(__name__)

success_states = {AttestationResult.success, AttestationResult.partial_success}


class PostBox(object):
    attestation_checker = None
    session = None
    priv_key = None
    hash_algo = None
    pem_key_public = None
    hash_key_public = None
    url = None
    component_url = None
    token = None
    use_get_token = None
    client_list = None
    state = None

    def __init__(
        self,
        attestation_checker,
        priv_key,
        url=None,
        token=None,
        graph=None,
        session=None,
    ):
        """
        [summary]

        Arguments:
            attestation_checker {[type]} -- [description]
            priv_key {[type]} -- [description]

        Keyword Arguments:
            url {[type]} -- [description] (default: {None})
            token {[type]} -- [description] (default: {None})
            graph {[type]} -- empty graph: extract graph, specified graph: try to complete, None: create temp graph (default: {None})
            session {[type]} -- [description] (default: {None})
        """  # noqa: E501
        if isinstance(attestation_checker, AttestationChecker):
            self.attestation_checker = attestation_checker
        else:
            self.attestation_checker = AttestationChecker(attestation_checker)
        self.priv_key = priv_key
        self.pem_key_public = (
            self.priv_key.public_key()
            .public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .strip()
        )
        splitted = url.split("?", 1) if url else (None,)
        use_get_token = None
        if len(splitted) == 2:
            self.url, params = splitted
            GET = parse_qs(params)
            if not token:
                token = GET.get("token", None)
                if token:
                    use_get_token = True
        else:
            self.url = splitted[0]
        self.update(token, graph, session, use_get_token)

    def update(self, token=None, graph=None, session=None, use_get_token=None):
        if session:
            self.session = session
        elif session is False or not self.session:
            self.session = requests.Session()
        if token:
            self.token = token
        elif use_get_token is not None:
            # keep setting if token does not change
            # first run: use_get_token is None so autodetect still starts
            use_get_token = self.use_get_token
        if use_get_token is not None:
            self.use_get_token = use_get_token
        else:
            self.use_get_token = False
        # empty graph or None
        if not graph:
            assert self.url
            try:
                # replaces graph with itself if graph is specified
                graph = self.retrieve_filtered_graph(self.url, out=graph)
            except Exception as exc:
                # don't retry if result is clear
                if use_get_token is not None:
                    raise exc
                self.use_get_token = True
                # replaces graph with itself if graph is specified
                graph = self.retrieve_filtered_graph(self.url, out=graph)
            retrieved_url = self.retrieve_missing(graph, self.url)
        else:
            retrieved_url = self.retrieve_missing(graph)
        if not self.token:
            # auto retrieve token from url
            splitted = retrieved_url.split("?", 1)
            if len(splitted) == 2:
                GET = parse_qs(splitted[1])
                self.token = GET.get("token", None)
                if GET.get("token", None):
                    self.use_get_token = True

        postboxes = get_postboxes(graph)

        if len(postboxes) != 1:
            if not self.url:
                raise SrcException("No postbox found/more than one found")
            else:
                try:
                    options = postboxes[self.url]
                except Exception:
                    raise SrcException("No postbox found/more than one found")
        else:
            self.url, options = next(iter(postboxes.items()))
        self.component_url = graph.value(
            predicate=spkcgraph["contents"], object=URIRef(self.url)
        ).toPython()

        self.hash_algo = options["hash_algorithm"]

        digest = hashes.Hash(self.hash_algo)
        digest.update(self.pem_key_public)
        self.hash_key_public = digest.finalize()
        (
            atth,
            errored,
            self.client_list,
        ) = self.attestation_checker.check_signatures(
            map(
                lambda x: (x["key"], x["signature"]),
                options["signatures"].values(),
            ),
            algo=self.hash_algo,
        )
        errored = set(map(lambda x: x[0], errored))
        own_key_found = list(
            filter(lambda x: x[0] == self.hash_key_public, self.client_list)
        )
        if not own_key_found:
            raise ValidationError("Own key was not found")
        if self.hash_key_public in errored:
            self.state = AttestationResult.error
        else:
            if errored:
                self.state = AttestationResult.partial_success
            else:
                self.state = AttestationResult.success
            # auto add if signed by own key
            self.attestation_checker.add(
                self.url, self.client_list, self.hash_algo, attestation=atth
            )

    def merge_and_headers(self, _url, **kwargs):
        if self.use_get_token:
            return merge_get_url(_url, token=self.token, **kwargs), {}
        return (merge_get_url(_url, **kwargs), {"X-TOKEN": self.token or ""})

    def retrieve_missing(self, graph, url=None, timeout=60):
        retrieved_url, missing_pages = get_pages(graph)
        if not url:
            url = retrieved_url
        if self.url and url.startswith(self.url):
            merged_url, headers = self.merge_and_headers(url)
        else:
            merged_url = url
            headers = {}
        for page in missing_pages:
            with self.session.get(
                merge_get_url(merged_url, page=page),
                headers=headers,
                timeout=timeout,
            ) as response:
                response.raise_for_status()
                graph.parse(data=response.content, format="turtle")
        return retrieved_url

    def retrieve_filtered_graph(self, url=None, timeout=60, out=None):
        if not url or url == self.url:
            merged_url, headers = self.merge_and_headers(
                self.url, raw="embed", search="\x1etype=PostBox\x1e"
            )
        else:
            merged_url = merge_get_url(
                url, raw="embed", search="\x1etype=PostBox\x1e"
            )
            headers = {}
        response = self.session.get(
            merged_url, headers=headers, timeout=timeout
        )
        response.raise_for_status()
        if out is None:
            graph = Graph()
        else:
            graph = out
        graph.parse(data=response.content, format="turtle")
        return graph

    def _send_dest(self, aes_key, fetch_url, dest):
        dest_url = merge_get_url(
            dest, raw="embed", search="\x1etype=PostBox\x1e"
        )
        response_dest = self.session.get(dest_url, timeout=60)
        try:
            response_dest.raise_for_status()
            g_dest = Graph()
            g_dest.parse(data=response_dest.content, format="turtle")
            self.retrieve_missing(g_dest, dest_url)
        except Exception as exc:
            raise DestException("postbox retrieval failed") from exc

        dest_postboxes = get_postboxes(g_dest)
        if len(dest_postboxes) != 1:
            raise DestException("No postbox found/more than one found")
        dest_postbox_url, dest_options = next(iter(dest_postboxes.items()))
        webref_url = replace_action(dest_postbox_url, "push_webref/")
        attestation = dest_options["attestation"]

        bdomain = dest_postbox_url.split("?", 1)[0]
        result_dest, errors, dest_keys = self.attestation_checker.check(
            bdomain,
            map(
                lambda x: (x["key"], x["signature"]),
                dest_options["signatures"].values(),
            ),
            attestation=attestation,
            algo=dest_options["hash_algorithm"],
            auto_add=True,
        )
        if result_dest == AttestationResult.domain_unknown:
            logger.info("add domain: %s", bdomain)
            self.attestation_checker.attestation.add(
                bdomain,
                dest_keys,
                algo=dest_options["hash_algorithm"],
                embed=True,
            )
        elif result_dest == AttestationResult.error:
            if len(dest_keys) == 0:
                raise DestException("No keys found")
            raise DestSecurityException("dest contains invalid keys", errors)

        dest_key_list = {}

        for k in dest_keys:
            enc = k[1].encrypt(
                aes_key,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=dest_options["hash_algorithm"]),
                    algorithm=dest_options["hash_algorithm"],
                    label=None,
                ),
            )
            # encrypt decryption key
            dest_key_list[
                "%s=%s" % (dest_options["hash_algorithm"].name, k[0].hex())
            ] = base64.b64encode(enc).decode("ascii")

        try:
            response_dest = self.session.post(
                webref_url,
                data={"url": fetch_url, "key_list": json.dumps(dest_key_list)},
                timeout=60,
            )
            response_dest.raise_for_status()
        except Exception as exc:
            raise DestException("post webref failed") from exc

    def send(
        self,
        inp,
        receivers,
        headers=b"\n",
        mode=SendMethod.shared,
        aes_key=None,
    ):
        if not self.ok:
            raise NotReady()
        if isinstance(receivers, str):
            receivers = [receivers]

        if isinstance(inp, (bytes, memoryview)):
            inp = io.BytesIO(bytes(inp))
        elif isinstance(inp, str):
            inp = io.BytesIO(inp.encode("utf8"))

        # 256 bit
        if not aes_key:
            aes_key = os.urandom(32)
        assert len(aes_key) == 32
        nonce = os.urandom(13)
        fencryptor = Cipher(
            algorithms.AES(aes_key),
            modes.GCM(nonce),
        ).encryptor()
        src_key_list = {}
        if mode == SendMethod.stealth:
            pass
        elif mode == SendMethod.private:
            enc = self.priv_key.public_key().encrypt(
                aes_key,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=self.hash_algo),
                    algorithm=self.hash_algo,
                    label=None,
                ),
            )
            # encrypt decryption key
            src_key_list[
                "%s=%s" % (self.hash_algo.name, self.pub_key_hash)
            ] = base64.b64encode(enc).decode("ascii")
        elif mode == SendMethod.shared:
            for k in self.client_list:
                enc = k[1].encrypt(
                    aes_key,
                    padding.OAEP(
                        mgf=padding.MGF1(algorithm=self.hash_algo),
                        algorithm=self.hash_algo,
                        label=None,
                    ),
                )
                # encrypt decryption key
                src_key_list[
                    "%s=%s" % (self.hash_algo.name, k[0].hex())
                ] = base64.b64encode(enc).decode("ascii")
        else:
            raise NotImplementedError()

        # remove raw as we parse html
        message_create_url, src_headers = self.merge_and_headers(
            replace_action(self.component_url, "add/MessageContent/"), raw=None
        )
        response = self.session.get(message_create_url, headers=src_headers)
        try:
            response.raise_for_status()
        except Exception as exc:
            raise SrcException(
                "retrieval csrftoken failed", response.text
            ) from exc
        g = Graph()
        g.parse(data=response.content, format="html")
        csrftoken = list(g.objects(predicate=spkcgraph["csrftoken"]))[0]
        # create message object
        response = self.session.post(
            message_create_url,
            data={
                "own_hash": self.hash_key_public,
                "key_list": json.dumps(src_key_list),
                "amount_tokens": len(receivers),
            },
            headers={"X-CSRFToken": csrftoken, **src_headers},  # only for src
            files={
                "encrypted_content": EncryptedFile(
                    fencryptor, inp, nonce, headers
                )
            },
        )
        try:
            response.raise_for_status()
        except Exception as exc:
            raise SrcException(
                "Message creation failed", response.text
            ) from exc
        if message_create_url == response.url:
            raise SrcException("Message creation failed", response.text)
        g = Graph()
        g.parse(data=response.content, format="html")
        fetch_url = list(
            map(
                lambda x: x.value,
                g.query(
                    """
                SELECT ?value
                WHERE {
                    ?property spkc:name ?name ;
                            spkc:value ?value .
                }
            """,
                    initNs={"spkc": spkcgraph},
                    initBindings={
                        "name": Literal("fetch_url", datatype=XSD.string)
                    },
                ),
            )
        )

        tokens = list(
            map(
                lambda x: x.value,
                g.query(
                    """
                SELECT ?value
                WHERE {
                    ?property spkc:name ?name ;
                            spkc:value ?value .
                }
            """,
                    initNs={"spkc": spkcgraph},
                    initBindings={
                        "name": Literal("tokens", datatype=XSD.string)
                    },
                ),
            )
        )

        if not fetch_url or not tokens:
            raise SrcException("Message creation failed", response.text)
        fetch_url = fetch_url[0].toPython()
        exceptions = []
        final_fetch_urls = []
        for receiver, token in zip(receivers, tokens):
            furl = merge_get_url(fetch_url, token=token.toPython())
            try:
                self._send_dest(aes_key, furl, receiver)
                final_fetch_urls.append(furl)
            except Exception as exc:
                exceptions.append(exc)
                # for autoremoval simulate access
                self.session.get(furl)
        return exceptions, final_fetch_urls, aes_key

    def receive(
        self,
        message_id,
        outfp=None,
        access_method=AccessMethod.view,
        extra_key_hashes=None,
        max_size=None,
    ):
        if not self.ok:
            raise NotReady()

        merged_url, headers = self.merge_and_headers(self.url, raw="embed")

        response = self.session.get(
            merge_get_url(self.url, raw="embed"), headers=headers
        )
        response.raise_for_status()
        graph = Graph()
        graph.parse(data=response.content, format="turtle")
        self.retrieve_missing(graph, merged_url)
        result = list(
            graph.query(
                """
                SELECT DISTINCT ?base ?hash_algorithm ?type
                WHERE {
                    ?base a <https://spkcspider.net/static/schemes/spkcgraph#spkc:Content> ;
                                  spkc:type ?type ;
                                  spkc:properties ?propalg , ?propid .
                    ?propid spkc:name ?idname ;
                            spkc:value ?idvalue .
                    ?propalg spkc:name ?algname ;
                             spkc:value ?hash_algorithm .
                }
            """,  # noqa E501
                initNs={"spkc": spkcgraph},
                initBindings={
                    "idvalue": Literal(message_id),
                    "algname": Literal("hash_algorithm", datatype=XSD.string),
                    "idname": Literal("id", datatype=XSD.string),
                },
            )
        )
        if not result or result[0].type.toPython() not in {
            "WebReference",
            "MessageContent",
        }:
            raise SrcException("No Message")
        # every object has it's own copy of the hash algorithm, used
        hash_algo = hashlib.new(result[0].hash_algorithm)
        hash_algo = getattr(hashes, hash_algo.name.upper())()

        if not outfp:
            outfp = tempfile.TempFile()

        if hash_algo == self.hash_algo:
            pub_key_hashalg = "%s=%s" % (
                hash_algo.name,
                self.hash_key_public.hex(),
            )
        else:
            digest = hashes.Hash(hash_algo)
            digest.update(self.pem_key_public)
            pub_key_hashalg = "%s=%s" % (
                hash_algo.name,
                digest.finalize().hex(),
            )

        key_hashes = list()
        if extra_key_hashes:
            extra_key_hashes = set(extra_key_hashes)
            extra_key_hashes.discard(pub_key_hashalg)
            for key in self.client_list:
                if key[0] in extra_key_hashes:
                    if hash_algo == self.hash_algo:
                        key_hashalg = "%s=%s" % (hash_algo.name, key[0])
                    else:
                        digest = hashes.Hash(hash_algo)
                        digest.update(key[1])
                        key_hashalg = "%s=%s" % (
                            hash_algo.name,
                            digest.finalize().hex(),
                        )
                    key_hashes.append(key_hashalg)

        if access_method == AccessMethod.view:
            key_hashes.append(pub_key_hashalg)

        retrieve_url, headers = self.merge_and_headers(
            replace_action(
                result[0].base,
                "bypass/"
                if (access_method == AccessMethod.bypass)
                else "message/",
            )
        )
        data = {}
        if access_method != AccessMethod.bypass:
            data.update({"max_size": max_size or "", "keyhash": key_hashes})
        response = self.session.post(
            retrieve_url, stream=True, headers=headers, data=data
        )
        try:
            response.raise_for_status()
        except Exception as exc:
            raise DestException(
                "Message retrieval failed", response.text
            ) from exc
        key_list = json.loads(response.headers["X-KEYLIST"])
        key = key_list.get(pub_key_hashalg, None)
        if not key:
            raise WrongRecipient("message not for me")
        decrypted_key = self.priv_key.decrypt(
            base64.b64decode(key),
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hash_algo),
                algorithm=hash_algo,
                label=None,
            ),
        )

        headblock = b""
        fdecryptor = None
        eparser = emailparser.BytesFeedParser(policy=policy.default)
        headers = None
        for chunk in response.iter_content(chunk_size=256):
            blob = None
            if not fdecryptor:
                headblock = b"%b%b" % (headblock, chunk)
                if b"\0" in headblock:
                    nonce, headblock = headblock.split(b"\0", 1)
                    nonce = base64.b64decode(nonce)
                    fdecryptor = Cipher(
                        algorithms.AES(decrypted_key),
                        modes.GCM(nonce),
                    ).decryptor()
                    blob = fdecryptor.update(headblock[:-16])
                    headblock = headblock[-16:]
                else:
                    continue
            else:
                blob = fdecryptor.update(b"%b%b" % (headblock, chunk[:-16]))
                headblock = chunk[-16:]
            if not headers:
                if b"\n\n" not in blob:
                    eparser.feed(blob)
                    continue
                headersrest, blob = blob.split(b"\n\n", 1)
                eparser.feed(headersrest)
                headers = eparser.close()
                # check  what to do
                t = headers.get("SPKC-Type", MessageType.email)
                if t == MessageType.email:
                    outfp.write(
                        headers.as_bytes(unixfrom=True, policy=policy.SMTP)
                    )
            outfp.write(blob)
        outfp.write(fdecryptor.finalize_with_tag(headblock))
        return outfp, headers, decrypted_key

    def list_messages(self):
        queried_webrefs = {}
        queried_messages = {}
        merged_url, headers = self.merge_and_headers(self.url, raw="embed")
        response = self.session.get(merged_url, headers=headers)
        try:
            response.raise_for_status()
        except Exception as exc:
            raise SrcException("Could not list messages") from exc
        graph = Graph()
        graph.parse(data=response.content, format="turtle")
        for i in graph.query(
            """
            SELECT DISTINCT ?base ?idvalue ?namevalue ?type
            WHERE {
                ?base a <https://spkcspider.net/static/schemes/spkcgraph#spkc:Content> ;
                   spkc:type ?type ;
                   spkc:properties ?propname , ?propid .
                ?propid spkc:name ?idname ;
                        spkc:value ?idvalue .
                ?propname spkc:name ?namename ;
                          spkc:value ?namevalue .
            }
        """,  # noqa E501
            initNs={"spkc": spkcgraph},
            initBindings={
                "idname": Literal("id", datatype=XSD.string),
                "namename": Literal("name", datatype=XSD.string),
            },
        ):
            if i.type.toPython() == "WebReference":
                queried = queried_webrefs
            elif i.type.toPython() == "MessageContent":
                queried = queried_messages
            else:
                continue
            queried.setdefault(str(i.base), {})
            queried[str(i.base)]["id"] = i.idvalue
            queried[str(i.base)]["name"] = i.namevalue
        return (queried_webrefs, queried_messages)

    @staticmethod
    def simple_check(
        url_or_graph, session=None, checker=None, auto_add=False, token=None
    ):
        if isinstance(url_or_graph, Graph):
            graph = url_or_graph
            retrieve_url, pages = get_pages(graph)
            url = retrieve_url.split("?", 1)[0]
        else:
            url = url_or_graph
            retrieve_url = merge_get_url(
                url_or_graph, raw="embed", search="\x1etype=PostBox\x1e"
            )
            if not session:
                session = requests.Session()
            response = session.get(
                retrieve_url, headers={"X-TOKEN": token or ""}
            )
            response.raise_for_status()
            graph = Graph()
            graph.parse(data=response.content, format="turtle")
            pages = get_pages(graph)[1]
        for page in pages:
            response = session.get(
                merge_get_url(retrieve_url, page=page),
                headers={"X-TOKEN": token or ""},
            )
            response.raise_for_status()
            graph.parse(data=response.content, format="turtle")
        postboxes = get_postboxes(graph)

        if len(postboxes) != 1:
            raise CheckError("No postbox found/more than one found")

        postbox, options = next(iter(postboxes.items()))

        if not isinstance(options.get("hash_algorithm"), hashes.HashAlgorithm):
            raise CheckError("Hash algorithm not found")
        if not isinstance(options.get("attestation"), bytes):
            raise CheckError("Attestation not found/wrong type")
        attestation, errors, key_list = AttestationChecker.check_signatures(
            map(
                lambda x: (x["key"], x["signature"]),
                options["signatures"].values(),
            ),
            attestation=options["attestation"],
            algo=options["hash_algorithm"],
        )
        if errors:
            raise CheckError(
                "Missmatch attestation with signatures",
                errored=errors,
                key_list=key_list,
                attestation=attestation,
            )
        if not checker:
            return {
                "result": AttestationResult.success,
                "errors": [],
                "key_list": key_list,
                **options,
            }
        url = url.split("?", 1)[0]
        ret = checker.check(
            url,
            key_list,
            algo=options["hash_algorithm"],
            auto_add=auto_add,
            embed=True,
            attestation=attestation,
        )
        if ret[0] == AttestationResult.error:
            raise CheckError(
                "Checker validation failed",
                errored=ret[1],
                key_list=ret[2],
                attestation=ret[0],
            )
        return {
            "result": ret[0],
            "errors": ret[1],
            "key_list": key_list,
            **options,
        }

    def check(self, url=None):
        if not url or url.startswith(self.url):
            merged_url, headers = self.merge_and_headers(
                self.url, raw="embed", search="\x1etype=PostBox\x1e"
            )
            response = self.session.get(
                merge_get_url(
                    merged_url, raw="embed", search="\x1etype=PostBox\x1e"
                ),
                headers=headers,
            )
            response.raise_for_status()
            graph = Graph()
            graph.parse(data=response.content, format="turtle")
            for page in get_pages(graph):
                with self.session.get(
                    merge_get_url(merged_url, page=page), headers=headers
                ) as response:
                    response.raise_for_status()
                    graph.parse(data=response.content, format="turtle")
        else:
            response = self.session.get(
                merge_get_url(url, raw="embed", search="\x1etype=PostBox\x1e")
            )
            response.raise_for_status()
            graph = Graph()
            graph.parse(data=response.content, format="turtle")
            for page in get_pages(graph):
                response = self.session.get(
                    merge_get_url(
                        self.url,
                        raw="embed",
                        search="\x1etype=PostBox\x1e",
                        page=page,
                    )
                )
                response.raise_for_status()
                graph.parse(data=response.content, format="turtle")
        if not url or url.startswith(self.url):
            result = self.simple_check(
                graph, url=url, checker=self.attestation_checker, auto_add=True
            )

            key_hashes = set(map(lambda x: x[0], result["key_list"]))
            if self.hash_key_public not in key_hashes:
                self.state = AttestationResult.error
                raise CheckError("Key is not part of chain")
            self.state = result["result"]
            self.client_list = result["key_list"]
            return result
        else:
            return self.simple_check(
                graph, url=url, checker=self.attestation_checker, auto_add=True
            )

    def sign(self, confirm=False):
        url, headers = self.merge_and_headers(self.url)
        try:
            check_result = self.simple_check(
                url,
                token=headers.get("X-TOKEN"),
                session=self.session,
            )
            attestation = check_result["attestation"]
            errored = set(map(lambda x: x[0], check_result["errors"]))
            key_list = check_result["key_list"]
            key_hashes = set(map(lambda x: x[0], key_list))
        except CheckError as exc:
            if not exc.key_list or not exc.errored or not exc.attestation:
                raise exc
            attestation = exc.attestation
            errored = set(map(lambda x: x[0], exc.errored))
            key_list = exc.key_list
            key_hashes = set(map(lambda x: x[0], key_list))

        if self.hash_key_public not in key_hashes:
            raise CheckError("Key is not part of chain")

        if not confirm:
            return (self.hash_key_public in errored, key_list)
        # change to update url
        postbox_update = merge_get_url(
            replace_action(self.url, "update/"),
            raw="embed",
            search="\x1etype=PostBox\x1e",
        )
        # retrieve csrftoken
        response = self.session.get(postbox_update, headers=headers)
        graph = Graph()
        graph.parse(data=response.content, format="html")
        csrftoken = list(graph.objects(predicate=spkcgraph["csrftoken"]))[
            0
        ].toPython()

        fields = dict(
            map(
                lambda x: (x[0].toPython(), x[1].toPython()),
                graph.query(
                    """
                    SELECT DISTINCT ?fieldname ?value
                    WHERE {
                        ?base spkc:fieldname ?fieldname ;
                              spkc:value ?value .
                    }
                """,
                    initNs={"spkc": spkcgraph},
                ),
            )
        )

        fields["signatures"] = []
        own_signature = None
        for key in self.client_list:
            if key[0] != self.hash_key_public:
                signature = key[2]
            else:
                # currently only one priv key is supported
                signature = self.priv_key.sign(
                    attestation,
                    padding.PSS(
                        mgf=padding.MGF1(self.hash_algo),
                        salt_length=padding.PSS.MAX_LENGTH,
                    ),
                    self.hash_algo,
                )
            if signature:
                fields["signatures"].append(
                    {
                        "hash": f"{self.hash_algo.name}={key[0].hex()}",
                        "signature": "{}={}".format(
                            self.hash_algo.name,
                            base64.b64encode(signature).decode("ascii"),
                        ),
                    }
                )
            if key[0] == self.hash_key_public:
                own_signature = fields["signatures"][-1]["signature"]

        fields["signatures"] = json.dumps(fields["signatures"])
        # update
        response = self.session.post(
            postbox_update,
            data=fields,
            headers={"X-CSRFToken": csrftoken, **headers},
        )
        try:
            response.raise_for_status()
            graph = Graph()
            graph.parse(data=response.content, format="html")
            vals = set(extract_property(graph, "signature").values())
            breakpoint()
            if own_signature not in vals:
                raise SrcException("could not update signature", own_signature)
        except SrcException as exc:
            raise exc
        except Exception as exc:
            raise SrcException(
                "could not update signature", own_signature
            ) from exc
        return (self.hash_key_public in errored, key_list)

    @property
    def ok(self):
        return self.state in success_states
