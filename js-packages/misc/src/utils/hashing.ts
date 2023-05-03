import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import { unserializeToArrayBuffer, utf8encoder } from './encoding'
import { unserializeToCryptoKey } from './encryption'

export function findWorkingHashAlgorithms(hashAlgorithms: string[]) {
    const hashAlgosSet = new Set<string>()
    const hashAlgos: string[] = []
    for (const algo of hashAlgorithms) {
        const mappedName = Constants.mapHashNames[algo]
        if (mappedName && !hashAlgosSet.has(mappedName.serializedName)) {
            hashAlgos.push(mappedName.serializedName)
        }
    }
    return hashAlgos
}

export async function hashObject(
    obj: Parameters<typeof unserializeToArrayBuffer>[0],
    hashAlgorithm: string
) {
    const mappedItem = Constants.mapHashNames[hashAlgorithm]
    return await crypto.subtle
        .digest(mappedItem.operationName, await unserializeToArrayBuffer(obj))
        .then(
            (data) =>
                `${mappedItem.serializedName}:${Buffer.from(data).toString(
                    'base64'
                )}`
        )
}

const _token_hash_prefix = utf8encoder.encode('secretgraph')
export async function hashToken(
    obj: Parameters<typeof unserializeToArrayBuffer>[0],
    hashAlgorithm: string
) {
    const mappedItem = Constants.mapHashNames[hashAlgorithm]
    const _arr = new Uint8Array(await unserializeToArrayBuffer(obj))
    const mergedArray = new Uint8Array(_token_hash_prefix.length + _arr.length)
    mergedArray.set(_token_hash_prefix)
    mergedArray.set(_arr, _token_hash_prefix.length)

    return await crypto.subtle
        .digest(mappedItem.operationName, mergedArray)
        .then(
            (data) =>
                `${mappedItem.serializedName}:${Buffer.from(data).toString(
                    'base64'
                )}`
        )
}

export async function hashKey(
    key: Interfaces.KeyInput,
    hashAlgorithm: string
): Promise<{
    publicKey: CryptoKey
    hash: string
}> {
    const mapItem = Constants.mapHashNames['' + hashAlgorithm]
    if (!mapItem) {
        throw new Error(
            'Invalid hash algorithm/no hash algorithm specified: ' +
                hashAlgorithm
        )
    }
    const publicKey = await unserializeToCryptoKey(
        key as Interfaces.KeyInput,
        {
            name: 'RSA-OAEP',
            hash: mapItem.operationName,
        },
        'publicKey'
    )
    const hash = await hashObject(
        crypto.subtle.exportKey('spki' as const, publicKey),
        mapItem.operationName
    )
    return {
        publicKey,
        hash,
    }
}

export async function sortedHash(
    inp: string[],
    hashAlgorithm: string
): Promise<string> {
    const mappedItem = Constants.mapHashNames[hashAlgorithm]
    return await crypto.subtle
        .digest(
            mappedItem.operationName,
            utf8encoder.encode(inp.sort().join(''))
        )
        .then(
            (data) =>
                `${mappedItem.serializedName}:${Buffer.from(data).toString(
                    'base64'
                )}`
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
    const _hashAlgorithms = findWorkingHashAlgorithms(hashAlgorithms)
    const obj = await unserializeToArrayBuffer(inp)
    const hashes: Promise<string>[] = []
    for (const algo of _hashAlgorithms) {
        hashes.push(hashObject(obj, algo))
    }
    return await Promise.all(hashes)
}
