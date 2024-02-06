from dataclasses import dataclass
from typing import Iterable, Literal

from .base_crypto import (
    CryptoResult,
    mapSignatureAlgorithms,
    validAsymmetricNames,
    validDeriveNames,
    validHashNames,
    validSymmetricNames,
)


@dataclass(frozen=True)
class FullCryptoResult(CryptoResult):
    pass


def findWorkingAlgorithms(
    algorithms: Iterable[str],
    domain: Literal["hash"]
    | Literal["derive"]
    | Literal["symmetric"]
    | Literal["asymmetric"]
    | Literal["signature"]
    | Literal["all"],
) -> list[str]:
    # only dicts are insertion order stable
    algos = {}
    for algo in algorithms:
        found = None
        if (domain == "all" or domain == "hash") and validHashNames[algo]:
            found = validHashNames[algo]
        elif (domain == "all" or domain == "derive") and validDeriveNames[algo]:
            found = validAsymmetricNames[algo]
        elif (domain == "all" or domain == "asymmetric") and validAsymmetricNames[algo]:
            found = validAsymmetricNames[algo]
        elif (domain == "all" or domain == "symmetric") and validSymmetricNames[algo]:
            found = validSymmetricNames[algo]
        elif (domain == "all" or domain == "signature") and mapSignatureAlgorithms[
            algo
        ]:
            found = mapSignatureAlgorithms[algo].serializedName
        if found and not algos.has(found):
            algos.add(found)
    return algos.keys()
