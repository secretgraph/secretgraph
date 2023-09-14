import unittest
import os
from cryptography.hazmat.primitives.asymmetric.utils import Prehashed
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from cryptography.hazmat.primitives.hashes import Hash
from secretgraph.core.utils.hashing import (
    findWorkingHashAlgorithms,
)


class CryptographyBaseTest(unittest.TestCase):
    def test_rsa_verifying_with_prehashed(self):
        # baseline test that library is working
        signkey = rsa.generate_private_key(
            public_exponent=65537, key_size=2048
        )
        pub_signkey = signkey.public_key()
        hashAlgorithm = findWorkingHashAlgorithms(["sha256"])[0]
        content = os.urandom(100)
        hashCtx = Hash(hashAlgorithm.algorithm)
        hashCtx.update(content)
        hashFinal = hashCtx.finalize()
        signature = signkey.sign(
            data=hashFinal,
            padding=padding.PSS(
                mgf=padding.MGF1(hashAlgorithm.algorithm),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            algorithm=Prehashed(hashAlgorithm.algorithm),
        )
        pub_signkey.verify(
            signature=signature,
            data=hashFinal,
            padding=padding.PSS(
                mgf=padding.MGF1(hashAlgorithm.algorithm),
                salt_length=padding.PSS.AUTO,
            ),
            algorithm=Prehashed(hashAlgorithm.algorithm),
        )
