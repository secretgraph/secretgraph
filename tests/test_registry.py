import unittest

import argon2
from faker import Faker
from hypothesis import given
from hypothesis import provisional as pv
from hypothesis import settings
from hypothesis import strategies as st

from secretgraph.core.utils.hashing import (
    DuplicateSaltError,
    MissingSaltError,
    generateArgon2RegistrySalt,
    sortedRegistryHash,
)


def gen_hash_domain():
    faker = Faker()
    return faker.word()


def gen_key_val():
    faker = Faker()
    keys = None
    while True:
        keys = faker.words(5)
        if "salt" not in keys:
            break
    values = [i.replace("\n", " ") for i in faker.texts(5, max_nb_chars=200)]
    return [f"{item[0]}={item[1]}" for item in zip(keys, values)]


class RegistryTests(unittest.TestCase):
    def test_registry(self):
        keys = [
            "foo=sl",
            f"salt={generateArgon2RegistrySalt(argon2.profiles.CHEAPEST)}",
        ]
        with self.subTest("positive"):
            self.assertEqual(
                sortedRegistryHash(keys, "https://secretgraph.net/", "Foo"),
                sortedRegistryHash(keys, "https://secretgraph.net/?", "Foo"),
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

    def test_double_salt(self):
        with self.subTest("positive"):
            keys = [
                "foo=sl",
                f"salt={generateArgon2RegistrySalt(argon2.profiles.CHEAPEST)}",
                "salt=sdjkdskj",
            ]
            sortedRegistryHash(keys, "https://secretgraph.net/", "Foo")
            keys = [
                "foo=sl",
                "salt=sdjkdskj",
                f"salt={generateArgon2RegistrySalt(argon2.profiles.CHEAPEST)}",
            ]
            sortedRegistryHash(keys, "https://secretgraph.net/", "Foo")

        with self.subTest("negative"):
            keys = [
                "foo=sl",
                f"salt={generateArgon2RegistrySalt(argon2.profiles.CHEAPEST)}",
                f"salt={generateArgon2RegistrySalt(argon2.profiles.CHEAPEST)}",
            ]
            with self.assertRaises(DuplicateSaltError):
                sortedRegistryHash(keys, "https://secretgraph.net/", "Foo")

    def test_missing_salt(self):
        keys = [
            "foo=sl",
        ]
        with self.assertRaises(MissingSaltError):
            sortedRegistryHash(keys, "https://secretgraph.net/", "Foo")
        keys = [
            "foo=sl",
            "salt=lldldssd",
        ]
        with self.assertRaises(MissingSaltError):
            sortedRegistryHash(keys, "https://secretgraph.net/", "Foo")

    @given(st.builds(gen_key_val), pv.urls(), st.builds(gen_hash_domain))
    @settings(deadline=400)
    def test_registry_fuzz(self, keys, url, domain):
        keys = [
            f"salt={generateArgon2RegistrySalt(argon2.profiles.CHEAPEST)}",
            *keys,
        ]
        self.assertEqual(
            sortedRegistryHash(keys, url, domain),
            sortedRegistryHash(keys, url, domain),
        )
