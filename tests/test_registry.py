import unittest

from secretgraph.core.utils.hashing import (
    generateArgon2RegistrySalt,
    sortedRegistryHash,
)


class RegistryTests(unittest.TestCase):
    def test_registry(self):
        keys = ["foo=sl", f"salt={generateArgon2RegistrySalt()}"]
        keys_double_salt = [
            "foo=sl",
            "salt=sdkjdskj",
            f"salt={generateArgon2RegistrySalt()}",
        ]
        with self.subTest("positive"):
            self.assertEqual(
                sortedRegistryHash(keys, "https://secretgraph.net/", "Foo"),
                sortedRegistryHash(keys, "https://secretgraph.net/?", "Foo"),
            )
            self.assertEqual(
                sortedRegistryHash(
                    keys_double_salt, "https://secretgraph.net/", "Foo"
                ),
                sortedRegistryHash(
                    keys_double_salt, "https://secretgraph.net/", "Foo"
                ),
            )

            self.assertEqual(
                sortedRegistryHash(
                    keys, "https://secretgraph.net/?foo=k&", "Foo"
                ),
                sortedRegistryHash(
                    keys, "https://secretgraph.net/?foo=k", "Foo"
                ),
            )

        with self.subTest("negative"):
            self.assertNotEqual(
                sortedRegistryHash(keys, "https://secretgraph.net/?", "Foo"),
                sortedRegistryHash(
                    keys[-1:], "https://secretgraph.net/?", "Foo2"
                ),
            )
            keys2 = list(keys)
            keys2[-1] = f"salt={generateArgon2RegistrySalt()}"
            self.assertNotEqual(
                sortedRegistryHash(keys, "https://secretgraph.net/?", "Foo"),
                sortedRegistryHash(keys2, "https://secretgraph.net/?", "Foo"),
            )

            self.assertNotEqual(
                sortedRegistryHash(
                    keys, "https://secretgraph.net/?foo=sl", "Foo"
                ),
                sortedRegistryHash(
                    keys[-1:], "https://secretgraph.net/?", "Foo"
                ),
            )
