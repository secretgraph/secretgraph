import * as Constants from '../constants'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
    utf8encoder,
} from './encoding'

export function findWorkingHashAlgorithms(hashAlgorithms: string[]) {
    const hashAlgos = []
    for (const algo of hashAlgorithms) {
        const mappedName = Constants.mapHashNames[algo]
        if (mappedName) {
            hashAlgos.push(mappedName.operationName)
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
export async function sortedHash(inp: string[], algo: string): Promise<string> {
    const mappedItem = Constants.mapHashNames[algo]
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
    hashAlgorithm: string,
    domain: string
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
        hashes.push(hashObject(inp, algo))
    }
    return await Promise.all(hashes)
}
