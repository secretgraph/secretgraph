import os
import unittest

from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed
from cryptography.hazmat.primitives.hashes import SHA256, SHA512, Hash


class CryptographyBaseTest(unittest.TestCase):
    def test_rsa_verifying_with_prehashed(self):
        for algo in [SHA512(), SHA256()]:
            with self.subTest(algo=algo):
                # baseline test that library is working
                signkey = rsa.generate_private_key(public_exponent=65537, key_size=2048)
                pub_signkey = signkey.public_key()
                content = os.urandom(100)
                hashCtx = Hash(algo)
                hashCtx.update(content)
                hashFinal = hashCtx.finalize()
                signature = signkey.sign(
                    data=hashFinal,
                    padding=padding.PSS(
                        mgf=padding.MGF1(algo),
                        salt_length=padding.PSS.MAX_LENGTH,
                    ),
                    algorithm=Prehashed(algo),
                )
                pub_signkey.verify(
                    signature=signature,
                    data=hashFinal,
                    padding=padding.PSS(
                        mgf=padding.MGF1(algo),
                        salt_length=padding.PSS.AUTO,
                    ),
                    algorithm=Prehashed(algo),
                )

    def test_rsa_encrypting(self):
        for algo in [SHA512()]:
            with self.subTest(algo=algo):
                # baseline test that library is working
                cryptkey = rsa.generate_private_key(
                    public_exponent=65537, key_size=2048
                )
                pub_cryptkey = cryptkey.public_key()

                content = os.urandom(100)
                content_enc = pub_cryptkey.encrypt(
                    content,
                    padding.OAEP(
                        mgf=padding.MGF1(algorithm=algo),
                        algorithm=algo,
                        label=None,
                    ),
                )
                self.assertEqual(
                    content,
                    cryptkey.decrypt(
                        content_enc,
                        padding.OAEP(
                            mgf=padding.MGF1(algorithm=algo),
                            algorithm=algo,
                            label=None,
                        ),
                    ),
                )
