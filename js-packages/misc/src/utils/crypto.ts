import * as Interfaces from '../interfaces'
import { unserializeToArrayBuffer, splitFirstOnly } from './encoding'
import { MaybePromise } from '../typing'
import {
    mapDeriveAlgorithms,
    mapEncryptionAlgorithms,
    mapSignatureAlgorithms,
} from './base_crypto'

export {
    mapHashNames,
    mapDeriveAlgorithms,
    mapEncryptionAlgorithms,
    mapSignatureAlgorithms,
} from './base_crypto'

export class UnknownAlgorithm extends Error {}

export class KeyTypeError extends Error {}
export class EmptyKeyError extends Error {}

function compareObjects(obj1: any, obj2: any) {
    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)])
    for (const key of keys) {
        if (obj1[key] != obj2[key]) {
            return false
        }
    }
    return true
}
const mapKeyUsages: {
    readonly [algo: string]: readonly KeyUsage[]
} = {
    PBKDF2: ['deriveBits', 'deriveKey'],
    'RSA-PSSprivate': ['sign'],
    'RSA-PSSpublic': ['verify'],
    ECDSAprivate: ['sign', 'deriveKey', 'deriveBits'],
    ECDSApublic: ['verify', 'deriveKey', 'deriveBits'],
    'RSA-OAEPprivate': ['decrypt'],
    'RSA-OAEPpublic': ['encrypt'],
    'AES-GCM': ['encrypt', 'decrypt'],
}

export async function toPublicKey(
    inp: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>,
    params: any
) {
    let _key: CryptoKey
    const _inp = await inp
    if (_inp instanceof CryptoKey) {
        _key = _inp
    } else if (
        (_inp as CryptoKeyPair).privateKey &&
        (_inp as CryptoKeyPair).publicKey
    ) {
        _key = (_inp as Required<CryptoKeyPair>).privateKey
    } else if (params.name.startsWith('AES-')) {
        // symmetric
        if (!mapKeyUsages[params.name]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        return await crypto.subtle.importKey(
            'raw',
            await unserializeToArrayBuffer(_inp as Interfaces.RawInput),
            params,
            true,
            mapKeyUsages[params.name]
        )
    } else {
        if (!mapKeyUsages[`${params.name}private`]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        _key = await crypto.subtle.importKey(
            'pkcs8' as const,
            await unserializeToArrayBuffer(_inp as Interfaces.RawInput),
            params,
            true,
            mapKeyUsages[`${params.name}private`]
        )
    }
    const tempkey = await crypto.subtle.exportKey('jwk', _key)
    // remove private data from JWK
    delete tempkey.d
    delete tempkey.dp
    delete tempkey.dq
    delete tempkey.q
    delete tempkey.qi
    tempkey.key_ops = ['sign', 'verify', 'encrypt', 'decrypt']
    if (!mapKeyUsages[`${params.name}public`]) {
        throw Error(
            `Public version not available, should not happen: ${
                params.name
            } (private: ${mapKeyUsages[`${params.name}private`]})`
        )
    }
    return await crypto.subtle.importKey(
        'jwk',
        tempkey,
        params,
        true,
        mapKeyUsages[`${params.name}public`]
    )
}

export async function derive(
    inp: MaybePromise<string | ArrayBuffer>,
    { params, algorithm }: { params?: any; algorithm?: string } = {}
): Promise<{ data: ArrayBuffer; params: any; serializedName: string }> {
    let inp_cleaned = await inp
    if (!algorithm && typeof inp_cleaned == 'string') {
        const splitted = splitFirstOnly(inp_cleaned)
        algorithm = splitted[0]
        inp_cleaned = splitted[1]
    }

    const entry = mapDeriveAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    return {
        ...(await entry.derive(inp_cleaned, params)),
        serializedName: entry.serializedName,
    }
}
export async function deriveString(
    data: MaybePromise<string | ArrayBuffer>,
    options: { params?: any; algorithm?: string } = {}
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

export async function encrypt(
    key: MaybePromise<any>,
    data: MaybePromise<string | ArrayBuffer>,
    { params, algorithm }: { params?: any; algorithm: string } = {
        algorithm: 'missing',
    }
): Promise<{ data: ArrayBuffer; params: any; serializedName: string }> {
    let data_cleaned = await unserializeToArrayBuffer(data)
    const entry = mapEncryptionAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    const key_cleaned = await unserializeToCryptoKey(
        key,
        entry.keyParams,
        'publicKey'
    )
    return {
        ...(await entry.encrypt(key_cleaned, data_cleaned, params)),
        serializedName: entry.serializedName,
    }
}

export async function encryptString(
    key: MaybePromise<any>,
    data: MaybePromise<string | ArrayBuffer>,
    options: { params?: any; algorithm: string }
): Promise<string> {
    const result = await encrypt(key, data, options)
    const entry = mapEncryptionAlgorithms[result.serializedName]
    const serialize = entry.serialize
        ? entry.serialize
        : async ({ data }: { data: ArrayBuffer }) =>
              await unserializeToArrayBuffer(data)
    return `${entry.serializedName}:${await serialize(result)}`
}

export async function decrypt(
    key: MaybePromise<any>,
    data: MaybePromise<string | ArrayBuffer>,
    { params, algorithm }: { params: any; algorithm: string }
): Promise<{ data: ArrayBuffer; params: any; serializedName: string }> {
    const entry = mapEncryptionAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    const [key_cleaned, data_cleaned]: [CryptoKey, ArrayBuffer] =
        await Promise.all([
            unserializeToCryptoKey(key, entry.keyParams, 'privateKey'),
            unserializeToArrayBuffer(data),
        ])

    return {
        ...(await entry.decrypt(key_cleaned, data_cleaned, params)),
        serializedName: entry.serializedName,
    }
}
export async function decryptString(
    key: MaybePromise<any>,
    data: MaybePromise<string>,
    { params, algorithm }: { params?: any; algorithm?: string } = {}
): Promise<{ data: ArrayBuffer; params: any; serializedName: string }> {
    let data_cleaned = await data
    if (!algorithm) {
        const splitted = splitFirstOnly(data_cleaned)
        algorithm = splitted[0]
        data_cleaned = splitted[1]
    }

    const entry = mapEncryptionAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    const key_cleaned = await unserializeToCryptoKey(
        key,
        entry.keyParams,
        'privateKey'
    )
    if (entry.deserialize) {
        return {
            ...(await entry.deserialize(data_cleaned)),
            serializedName: entry.serializedName,
        }
    }
    return {
        ...(await entry.decrypt(
            key_cleaned,
            await unserializeToArrayBuffer(data_cleaned),
            params
        )),
        serializedName: entry.serializedName,
    }
}
export async function sign(
    key: MaybePromise<any>,
    data: MaybePromise<string | ArrayBuffer>,
    { algorithm }: { algorithm: string }
): Promise<string> {
    const entry = mapSignatureAlgorithms['' + algorithm]
    if (!entry) {
        throw Error('invalid algorithm: ' + algorithm)
    }
    const [key_cleaned, data_cleaned]: [CryptoKey, ArrayBuffer] =
        await Promise.all([
            unserializeToCryptoKey(key, entry.keyParams, 'privateKey'),
            unserializeToArrayBuffer(data),
        ])
    return `${entry.serializedName}:${await entry.sign(
        key_cleaned,
        data_cleaned
    )}`
}
export async function verify(
    key: MaybePromise<any>,
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
        throw Error('invalid algorithm: ' + algorithm)
    }
    const [key_cleaned, data_cleaned]: [CryptoKey, ArrayBuffer] =
        await Promise.all([
            unserializeToCryptoKey(key, entry.keyParams, 'publicKey'),
            unserializeToArrayBuffer(data),
        ])
    return entry.verify(key_cleaned, signature_cleaned, data_cleaned)
}
export async function unserializeToCryptoKey(
    inp: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>,
    params: any,
    type: 'privateKey' | 'publicKey' = 'publicKey',
    failInsteadConvert?: boolean
): Promise<CryptoKey> {
    let _data: ArrayBuffer, _result: CryptoKey
    const temp1 = await inp
    if (temp1 instanceof CryptoKey) {
        if (
            compareObjects(temp1.algorithm, params) &&
            type.startsWith(temp1.type)
        ) {
            return temp1
        }
        if (type == 'publicKey' && temp1.type == 'private') {
            if (failInsteadConvert) {
                throw new KeyTypeError('Not a Public Key')
            }
            return await toPublicKey(temp1, params)
        }
        _data = await unserializeToArrayBuffer(temp1)
    } else if (
        (temp1 as CryptoKeyPair).privateKey &&
        (temp1 as CryptoKeyPair).publicKey
    ) {
        let temp2 = (temp1 as Required<CryptoKeyPair>)[type]
        if (compareObjects(temp2.algorithm, params)) {
            return temp2
        }
        _data = await unserializeToArrayBuffer(temp2)
    } else {
        _data = await unserializeToArrayBuffer(temp1 as Interfaces.RawInput)
    }
    if (!_data.byteLength) {
        throw new EmptyKeyError('Empty key')
    }
    if (params.name.startsWith('AES-')) {
        const entry = mapKeyUsages[params.name]
        if (!entry) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        if (_data.byteLength > 32) {
            console.warn(
                'Invalid key length: ' + _data.byteLength + ' fixing...'
            )
            _data = _data.slice(-32)
        }
        // symmetric
        _result = await crypto.subtle.importKey(
            'raw' as const,
            _data,
            params,
            true,
            entry
        )
    } else {
        if (
            !mapKeyUsages[`${params.name}private`] ||
            !mapKeyUsages[`${params.name}public`]
        ) {
            throw new UnknownAlgorithm(
                `Algorithm not supported: ${params.name}`
            )
        }
        try {
            _result = await crypto.subtle.importKey(
                'pkcs8',
                _data,
                params,
                true,
                mapKeyUsages[`${params.name}private`]
            )
            if (type == 'publicKey' && _result.type == 'private') {
                if (failInsteadConvert) {
                    throw new KeyTypeError('Not a Public Key')
                }
                _result = await toPublicKey(_result, params)
            }
        } catch (exc) {
            if (exc instanceof KeyTypeError) {
                throw exc
            }
            if (type == 'publicKey') {
                try {
                    // serialize publicKey
                    _result = await crypto.subtle.importKey(
                        'spki',
                        _data,
                        params,
                        true,
                        mapKeyUsages[`${params.name}public`]
                    )
                } catch (exc_inner) {
                    console.debug(
                        'error importing, parameters: ',
                        params,
                        _data,
                        mapKeyUsages[`${params.name}public`],
                        exc_inner.stack
                    )
                    throw exc_inner
                }
            } else {
                console.debug(
                    'error invalid, parameters: ',
                    params,
                    _data,
                    mapKeyUsages[`${params.name}public`],
                    exc,
                    exc.stack
                )
                throw Error('Not a PrivateKey')
            }
        }
    }
    return _result
}
