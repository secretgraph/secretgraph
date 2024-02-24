import * as Interfaces from '../interfaces'
import { unserializeToArrayBuffer, splitFirstOnly } from './encoding'
import { MaybePromise } from '../typing'
import {
    mapDeriveAlgorithms,
    mapEncryptionAlgorithms,
    mapSignatureAlgorithms,
    ParamsType,
    KeyType,
} from './base_crypto'

export {
    mapDeriveAlgorithms,
    mapEncryptionAlgorithms,
    mapSignatureAlgorithms,
    DEFAULT_SIGNATURE_ALGORITHM,
    DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM,
    DEFAULT_SYMMETRIC_ENCRYPTION_ALGORITHM,
    DEFAULT_DERIVE_ALGORITHM,
} from './base_crypto'

export {
    KeyTypeError,
    UnknownAlgorithm,
    EmptyKeyError,
} from './base_crypto_legacy'

import { UnknownAlgorithm } from './base_crypto_legacy'

export function findWorkingAlgorithms(
    algorithms: string[],
    domain:
        | 'hash'
        | 'derive'
        | 'symmetric'
        | 'asymmetric'
        | 'signature'
        | 'all'
): string[] {
    // only signature needs no extra set
    // js sets are insertion order stable
    const algos: Set<string> = new Set()
    for (const algo of algorithms) {
        let found = null
        if (
            (domain == 'all' || domain == 'hash') &&
            mapDeriveAlgorithms[algo]?.type == 'hash'
        ) {
            found = mapDeriveAlgorithms[algo].serializedName
        } else if (
            (domain == 'all' || domain == 'derive') &&
            mapDeriveAlgorithms[algo]?.type == 'derive'
        ) {
            found = mapDeriveAlgorithms[algo].serializedName
        } else if (
            (domain == 'all' || domain == 'asymmetric') &&
            mapEncryptionAlgorithms[algo]?.type == 'asymmetric'
        ) {
            found = mapEncryptionAlgorithms[algo].serializedName
        } else if (
            (domain == 'all' || domain == 'symmetric') &&
            mapEncryptionAlgorithms[algo]?.type == 'symmetric'
        ) {
            found = mapEncryptionAlgorithms[algo].serializedName
        } else if (
            (domain == 'all' || domain == 'signature') &&
            mapSignatureAlgorithms[algo]
        ) {
            found = mapSignatureAlgorithms[algo].serializedName
        }
        if (found && !algos.has(found)) {
            algos.add(found)
        }
    }
    return [...algos]
}

export async function derive(
    inp: MaybePromise<string | ArrayBuffer>,
    { params, algorithm }: { params?: any; algorithm: string } = {
        algorithm: '',
    }
): Promise<{ data: ArrayBuffer; params: any; serializedName: string }> {
    let inp_cleaned: ArrayBuffer | string = await inp
    if (!algorithm && typeof inp_cleaned == 'string') {
        const splitted = splitFirstOnly(inp_cleaned)
        algorithm = splitted[0]
        inp_cleaned = splitted[1]
    }

    const entry = mapDeriveAlgorithms['' + algorithm]
    if (!entry) {
        throw new UnknownAlgorithm('invalid algorithm: ' + algorithm)
    }
    if (typeof inp_cleaned == 'string') {
        const result = await entry.deserialize(inp_cleaned, params)
        inp_cleaned = result.data
        params = result.params
    }
    return {
        ...(await entry.derive(inp_cleaned, params)),
        serializedName: entry.serializedName,
    }
}

export async function deserializeDerivedString(
    inp: MaybePromise<string>,
    { params, algorithm }: { params?: any; algorithm: string } = {
        algorithm: '',
    } // params are here fallback?
) {
    let inp_cleaned: string = await inp
    if (!algorithm) {
        const splitted = splitFirstOnly(inp_cleaned)
        algorithm = splitted[0]
        inp_cleaned = splitted[1]
    }
    const entry = mapDeriveAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    const result = await entry.deserialize(inp_cleaned, params)
    return { ...result, serializedName: entry.serializedName }
}

export async function deriveString(
    data: MaybePromise<string | ArrayBuffer>,
    options: { params?: any; algorithm: string } = { algorithm: '' }
): Promise<string> {
    const result = await derive(data, options)
    const entry = mapDeriveAlgorithms[result.serializedName]
    return `${entry.serializedName}:${await entry.serialize(result)}`
}

export async function serializeDerive(
    inp: MaybePromise<{
        data: ArrayBuffer
        params: any
        serializedName: string
    }>
): Promise<string> {
    const result = await inp
    const entry = mapDeriveAlgorithms[result.serializedName]
    return `${entry.serializedName}:${await entry.serialize(result)}`
}

export async function generateKey(
    { params, algorithm }: { params?: any; algorithm: string } = {
        algorithm: '',
    }
): Promise<{
    params?: any
    serializedName: string
    key: any
}> {
    const entry = mapEncryptionAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    return {
        ...(await entry.generateKey(params)),
        serializedName: entry.serializedName,
    }
}

export async function encrypt(
    key: MaybePromise<KeyType>,
    data: MaybePromise<string | ArrayBuffer>,
    { params, algorithm }: { params?: ParamsType; algorithm: string } = {
        algorithm: '',
    }
): Promise<{
    data: ArrayBuffer
    params: any
    serializedName: string
    key: ArrayBuffer
}> {
    let data_cleaned = await unserializeToArrayBuffer(data)
    const entry = mapEncryptionAlgorithms['' + algorithm]
    if (!entry) {
        throw new UnknownAlgorithm('invalid algorithm: ' + algorithm)
    }
    return {
        ...(await entry.encrypt(key, data_cleaned, params)),
        serializedName: entry.serializedName,
    }
}

export async function encryptString(
    key: MaybePromise<KeyType>,
    data: MaybePromise<string | ArrayBuffer>,
    options: { params?: ParamsType; algorithm: string }
): Promise<string> {
    const result = await encrypt(key, data, options)
    const entry = mapEncryptionAlgorithms[result.serializedName]
    if (!entry) {
        throw new UnknownAlgorithm(
            'invalid algorithm: ' + result.serializedName
        )
    }
    return `${entry.serializedName}:${await entry.serializeParams(
        result.params
    )}:${Buffer.from(result.data).toString('base64')}`
}

export async function serializeEncryptionParams({
    params,
    serializedName,
}: {
    params: any
    serializedName: string
}) {
    const entry = mapEncryptionAlgorithms[serializedName]
    if (!entry) {
        throw Error('invalid algorithm: ' + serializedName)
    }
    if (entry.serializeParams) {
        return `${serializedName}:${await entry.serializeParams(params)}`
    } else {
        return `${serializedName}:`
    }
}

export async function decrypt(
    key: MaybePromise<KeyType>,
    data: MaybePromise<string | ArrayBuffer>,
    { params, algorithm }: { params: ParamsType | string; algorithm?: string }
): Promise<{
    data: ArrayBuffer
    params: any
    serializedName: string
    key: ArrayBuffer
}> {
    if (!algorithm && typeof params == 'string') {
        const splitted = splitFirstOnly(params)
        algorithm = splitted[0]
        const entry = mapEncryptionAlgorithms['' + algorithm]
        params = (await entry.deserialize(splitted[1])).params
    }
    const entry = mapEncryptionAlgorithms['' + algorithm]
    if (!entry) {
        throw new UnknownAlgorithm('invalid algorithm: ' + algorithm)
    }
    const data_cleaned = await unserializeToArrayBuffer(data)
    if (data_cleaned === undefined) {
        throw new Error('Empty data')
    }
    try {
        return {
            ...(await entry.decrypt(key, data_cleaned, params)),
            serializedName: entry.serializedName,
        }
    } catch (exc) {
        // console.error('decrypt failed:', key_cleaned, data_cleaned, params)

        throw exc
    }
}
export async function decryptString(
    key: MaybePromise<KeyType>,
    data: MaybePromise<string>,
    {
        params,
        algorithm,
    }: {
        params?: any
        algorithm?: string
    } = {}
): Promise<{
    data: ArrayBuffer
    params: any
    serializedName: string
    key: ArrayBuffer
}> {
    let data_cleaned = await data
    if (!algorithm) {
        const splitted = splitFirstOnly(data_cleaned)
        algorithm = splitted[0]
        data_cleaned = splitted[1]
    }

    const entry = mapEncryptionAlgorithms['' + algorithm]
    if (!entry) {
        throw new UnknownAlgorithm('invalid algorithm: ' + algorithm)
    }
    const result = await entry.deserialize(data_cleaned, params)
    params = result.params
    if (!result.data) {
        throw Error('no data to decrypt provided')
    }
    return await decrypt(await key, result.data, {
        params,
        algorithm: entry.serializedName,
    })
}
export async function sign(
    key: MaybePromise<KeyType>,
    data: MaybePromise<string | ArrayBuffer>,
    { algorithm }: { algorithm: string }
): Promise<string> {
    const entry = mapSignatureAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    const data_cleaned = await unserializeToArrayBuffer(data)
    try {
        return `${entry.serializedName}:${await entry.sign(
            await key,
            data_cleaned
        )}`
    } catch (exc) {
        console.error('sign parameters:', algorithm, data_cleaned)
        throw exc
    }
}
export async function verify(
    key: MaybePromise<KeyType>,
    signature: MaybePromise<string>,
    data: MaybePromise<string | ArrayBuffer>,
    { algorithm }: { algorithm?: string } = {}
): Promise<boolean> {
    let signature_cleaned = await signature
    if (!algorithm) {
        const splitted = splitFirstOnly(signature_cleaned)
        algorithm = splitted[0]
        signature_cleaned = splitted[1]
    }

    const entry = mapSignatureAlgorithms['' + algorithm]
    if (!entry) {
        throw new UnknownAlgorithm('invalid algorithm: ' + algorithm)
    }
    const data_cleaned = await unserializeToArrayBuffer(data)
    return entry.verify(await key, signature_cleaned, data_cleaned)
}
