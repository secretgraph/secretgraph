import { unserializeToArrayBuffer, utf8encoder } from './encoding'
import { deriveString } from './crypto'

export async function hashObject(
    obj: Parameters<typeof unserializeToArrayBuffer>[0],
    deriveAlgorithm: string
) {
    return await deriveString(await unserializeToArrayBuffer(obj), {
        algorithm: deriveAlgorithm,
    })
}

const _token_hash_prefix = utf8encoder.encode('secretgraph')
export async function hashToken(
    obj: Parameters<typeof unserializeToArrayBuffer>[0],
    deriveAlgorithm: string
) {
    const _arr = new Uint8Array(await unserializeToArrayBuffer(obj))
    const mergedArray = new Uint8Array(_token_hash_prefix.length + _arr.length)
    mergedArray.set(_token_hash_prefix)
    mergedArray.set(_arr, _token_hash_prefix.length)

    return await deriveString(await unserializeToArrayBuffer(mergedArray), {
        algorithm: deriveAlgorithm,
    })
}

export async function sortedHash(
    inp: string[],
    hashAlgorithm: string
): Promise<string> {
    return await hashObject(
        utf8encoder.encode(inp.sort().join('')),
        hashAlgorithm
    )
}

export async function hashTagsContentHash(
    inp: string[],
    domain: string,
    hashAlgorithm: string
): Promise<string> {
    return `${domain}:${await sortedHash(inp, hashAlgorithm)}`
}

export async function calculateHashes(
    inp: Parameters<typeof unserializeToArrayBuffer>[0],
    hashAlgorithms: string[]
): Promise<string[]> {
    const obj = await unserializeToArrayBuffer(inp)
    const hashes: Promise<string>[] = []
    for (const algo of hashAlgorithms) {
        hashes.push(hashObject(obj, algo))
    }
    return await Promise.all(hashes)
}
