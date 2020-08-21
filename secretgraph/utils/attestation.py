__all__ = ["AttestationChecker"]

import base64
import binascii
from itertools import repeat

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from spider_messaging.constants import AttestationResult, DomainInfo, KeyTriple
from spider_messaging.utils.keys import load_public_key


def _extract_hash_key2(val, algo=None):
    key = None
    signature = None
    if isinstance(val, KeyTriple):
        return val
    elif isinstance(val, (tuple, list)):
        v = val[0]
        if len(val) >= 2:
            try:
                key = load_public_key(val[1])
            except ValueError:
                if len(val) >= 3:
                    raise
                # go to second analysis
                v = load_public_key(val[0])
                signature = val[1]
        if len(val) >= 3:
            signature = val[2]
    else:
        v = val

    # second analysis
    if isinstance(v, bytes):
        # v is already binary hash
        return KeyTriple(v, key, signature)
    elif isinstance(v, str):
        # v is hex encoded hash with optional prefix
        v = v.split("=", 1)[-1]
        return KeyTriple(binascii.unhexlify(v), key, signature)
    elif hasattr(v, "public_key"):
        # v is private key
        v = v.public_key()

    # third analysis (check if v is public key)
    if hasattr(v, "public_bytes"):
        digest = hashes.Hash(algo, backend=default_backend())
        digest.update(
            v.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ).strip()
        )
        return KeyTriple(
            digest.finalize(),
            v,
            signature
        )
    else:
        raise NotImplementedError()


def _extract_hash_key(val, algo=None, check_hash=False):
    ret = _extract_hash_key2(val, algo=algo)
    if check_hash and algo and ret[1] and len(val) >= 2:
        digest = hashes.Hash(algo, backend=default_backend())
        digest.update(
            ret[1].public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ).strip()
        )
        if ret[0] != digest.finalize():
            raise ValueError("Key does not match hash")
    return ret


def _extract_only_hash(val, algo=None, check_hash=False):
    return _extract_hash_key(val, algo=algo, check_hash=check_hash)[0]


class AttestationChecker(object):
    con = None

    def __init__(self, config):
        self.config = config
        self.create()

    def __del__(self):
        self.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def create(self):
        cur = self.con.cursor()
        cur.execute(
            '''
            CREATE TABLE IF NOT EXISTS domain (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                attestation BLOB,
                hash_algo TEXT
            )
            '''
        )
        cur.execute(
            '''
            CREATE TABLE IF NOT EXISTS key (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                domain INTEGER NOT NULL,
                hash BLOB NOT NULL,
                FOREIGN KEY(domain) REFERENCES domain(id),
                UNIQUE(domain, hash)
            )
            '''
        )
        self.con.commit()

    def close(self):
        self.con.close()

    @classmethod
    def calc_attestation(cls, key_list, algo, embed=False):
        """
            key_list:
                string/bytes: hashes
                pairs (hash, key): use hash of key
                pairs (key, signature): autogeneration of missing key hash
                triples (hash, key, signature):
                    use hash of key
            embed: assert correct triple format. Disables checks, conversions
        """
        hasher = hashes.Hash(algo, backend=default_backend())
        if not embed:
            def func(x):
                return _extract_only_hash(x, algo)
        else:
            def func(x):
                return x[0]
        for digest in sorted(map(func, key_list)):
            hasher.update(digest)
        return hasher.finalize()

    @classmethod
    def check_signatures(
        cls, key_list, algo=None, attestation=None, embed=False
    ):
        """
        Check signatures against (calculated) attestation

        Arguments:
            key_list {Iterable((key, signature))} -- [description]
            key_list {Iterable((pubkeyhash, key, signature))} -- hash provided as first argument (more efficient)

        Keyword Arguments:
            algo {Hash} -- cryptography algorithm for hashing (default: {None})
            attestation {bytes,str} -- provide attestation instead of generating it again (default: {None})
            embed {bool} -- assert correct triples format, disables checks (default: {False})

        Raises:
            ValueError: Wrong input

        Returns:
            (attestation, errored keys, key_list) -- []

        """  # noqa: E501
        if not embed:
            key_list = [
                 _extract_hash_key(x, algo) for x in key_list
            ]

        assert \
            not embed or \
            len(key_list) == 0 or \
            isinstance(key_list[0], KeyTriple)
        if not attestation and algo:
            attestation = cls.calc_attestation(key_list, algo, embed=True)
        elif isinstance(attestation, str):
            attestation = base64.b64decode(attestation)
        elif not attestation:
            raise ValueError("Provide either attestation or hash algo")
        errored = []
        for entry in key_list:
            key = entry[1]
            try:
                hashalgo, signature = entry[2].split("=", 1)
                hashalgo = getattr(hashes, hashalgo.upper())()
                key.verify(
                    base64.b64decode(signature),
                    attestation,
                    padding.PSS(
                        mgf=padding.MGF1(hashalgo),
                        salt_length=padding.PSS.MAX_LENGTH
                    ),
                    hashalgo
                )
            except (InvalidSignature, ValueError):
                errored.append(entry)
                continue
        return (attestation, errored, key_list)

    def get_domain_info(self, domain):
        domain_row = self.con.execute("""
            SElECT id, attestation, hash_algo FROM domain WHERE url=?
        """, (domain,)).fetchone()
        if domain_row:
            return DomainInfo(*domain_row)
        return DomainInfo(None, None, None)

    def add(
        self, domain, key_list, algo, *, attestation=None, _cur=None,
        embed=False
    ):
        """
            attestation: provide attestation instead of generating it again
            algo: hash algorithm
            key_list:
                string/bytes: use as hash
                public_keys/certs: calc hash (in combination with algo)
                pairs (hash, key): use hash
                pairs (key, signature): calc hash
                triples (hash, key, signature): use hash
        """
        # _cur is used if embedding in check
        if not embed:
            key_list = [
                _extract_hash_key(x, algo, not _cur) for x in key_list
            ]
        assert \
            not embed or \
            len(key_list) == 0 or \
            isinstance(key_list[0], KeyTriple)
        if isinstance(attestation, str):
            attestation = base64.b64decode(attestation)
        elif not attestation and algo:
            attestation = self.calc_attestation(key_list, algo, embed=True)
        if _cur:
            cursor = _cur
        else:
            cursor = self.con.cursor()
        if attestation is None:
            cursor.execute("""
                INSERT OR IGNORE INTO domain (url) VALUES(?)
            """, (domain, ))
        else:
            if not attestation:
                attestation = None
            cursor.execute("""
                INSERT OR REPLACE INTO domain
                (url, attestation)
                VALUES(?, ?)
            """, (domain, attestation))

        cursor.execute("""
            INSERT OR REPLACE INTO domain
            (url, hash_algo)
            VALUES(?, ?)
        """, (domain, algo.name.upper()))

        domainid = self.con.execute("""
            SElECT id, attestation FROM domain WHERE url=?
        """, (domain,)).fetchone()[0]

        cursor.executemany("""
            INSERT OR IGNORE INTO key (domain, hash)
            VALUES(?, ?);
        """, zip(repeat(domainid), map(lambda x: x[0], key_list)))
        self.con.commit()
        return key_list

    def check(
        self, domain, key_list, algo=None, *, attestation=None, auto_add=True,
        embed=False
    ):
        """
            attestation: provide attestation
            key_list:
                pairs (key, signature): check also signature
                triples (hash, key, signature): check signature, recalc
            embed: assert correct triples format, disables checks
        """
        assert algo or not auto_add
        if not embed:
            key_list = [
                _extract_hash_key(x, algo, True) for x in key_list
            ]
        assert \
            not embed or \
            len(key_list) == 0 or \
            isinstance(key_list[0], KeyTriple)
        if len(key_list) == 0:
            AttestationResult.error, [], key_list
        only_hashes = set(map(lambda x: x[0], key_list))
        if isinstance(attestation, str):
            attestation = base64.b64decode(attestation)
        elif not attestation and algo:
            attestation = self.calc_attestation(key_list, algo, embed=True)

        if attestation:
            result = self.check_signatures(
                key_list, attestation=attestation, embed=True
            )
            if result[1]:
                return (AttestationResult.error, result[1], key_list)

        domain_row = self.con.execute("""
            SElECT id, attestation FROM domain WHERE url=?
        """, (domain,)).fetchone()
        if not domain_row:
            return (
                AttestationResult.domain_unknown, [], key_list
            )
        # nothing has changed, skip
        if attestation and domain_row[1] == attestation:
            return (AttestationResult.success, [], key_list)

        # hack lists
        old_hashes = self.con.execute("""
            SELECT hash FROM key WHERE domain=? AND hash IN ({})
        """.format(("?, "*len(only_hashes)).rstrip(", ")),
            (domain_row[0], *only_hashes)
        )
        old_hashes = set(map(lambda x: x[0], old_hashes.fetchall()))
        if len(old_hashes) == 0:
            return (AttestationResult.error, [], key_list)
        if old_hashes == only_hashes:
            return (AttestationResult.success, [], key_list)
        if auto_add:
            # hack lists
            _cur = self.con.cursor()
            _cur.execute("""
                DELETE FROM key WHERE domain=? AND hash NOT IN ({})
            """.format(("?, "*len(only_hashes)).rstrip(", ")),
                (domain_row[0], *only_hashes)
            )
            if only_hashes.issubset(old_hashes):
                self.con.commit()
                return (AttestationResult.success, [], key_list)
            self.add(
                domain, only_hashes.difference(old_hashes), algo,
                attestation=attestation, _cur=_cur, embed=True
            )
        if only_hashes.issubset(old_hashes):
            return (AttestationResult.success, [], key_list)
        return (AttestationResult.partial_success, [], key_list)
