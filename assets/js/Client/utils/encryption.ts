import {
    CryptoRSAInInterface,
    CryptoRSAOutInterface,
    CryptoGCMInInterface,
    CryptoGCMOutInterface,
    PWInterface,
    RawInput,
    KeyInput,
    NonKeyInput,
    KeyOutInterface,
} from '../interfaces'
import { mapHashNames, mapEncryptionAlgorithms } from '../constants'

import { utf8encoder } from './misc'
import * as IterableOps from './iterable'

export async function toPBKDF2key(
    inp: RawInput | PromiseLike<RawInput>
): Promise<CryptoKey> {
    let data: ArrayBuffer
    const _inp = await inp
    if (typeof _inp === 'string') {
        data = utf8encoder.encode(_inp)
    } else if (
        _inp instanceof ArrayBuffer ||
        (_inp as any).buffer instanceof ArrayBuffer
    ) {
        data = _inp as ArrayBuffer
    } else if (_inp instanceof File) {
        data = await (_inp as File).arrayBuffer()
    } else if (_inp instanceof CryptoKey) {
        if ((_inp as CryptoKey).algorithm.name != 'PBKDF2') {
            throw Error(
                'Invalid algorithm: ' + (_inp as CryptoKey).algorithm.name
            )
        }
        return _inp as CryptoKey
    } else {
        throw Error(
            `Invalid input: ${_inp} (${(_inp as RawInput).constructor})`
        )
    }

    return crypto.subtle.importKey(
        'raw',
        data,
        'PBKDF2',
        false,
        mapEncryptionAlgorithms.PBKDF2.usages
    )
}

export async function toPublicKey(
    inp: KeyInput | PromiseLike<KeyInput>,
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
        _key = (_inp as CryptoKeyPair).privateKey
    } else if (params.name.startsWith('AES-')) {
        // symmetric
        if (!mapEncryptionAlgorithms[params.name]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        return await crypto.subtle.importKey(
            'raw' as const,
            await unserializeToArrayBuffer(_inp as RawInput),
            params,
            true,
            mapEncryptionAlgorithms[params.name].usages
        )
    } else {
        if (!mapEncryptionAlgorithms[`${params.name}private`]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        _key = await crypto.subtle.importKey(
            'pkcs8' as const,
            await unserializeToArrayBuffer(_inp as RawInput),
            params,
            true,
            mapEncryptionAlgorithms[`${params.name}private`].usages
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
    if (!mapEncryptionAlgorithms[`${params.name}public`]) {
        throw Error(
            `Public version not available, should not happen: ${
                params.name
            } (private: ${mapEncryptionAlgorithms[`${params.name}private`]})`
        )
    }
    return await crypto.subtle.importKey(
        'jwk',
        tempkey,
        params,
        true,
        mapEncryptionAlgorithms[`${params.name}public`].usages
    )
}

export async function unserializeToArrayBuffer(
    inp: RawInput | KeyOutInterface | PromiseLike<RawInput | KeyOutInterface>
): Promise<ArrayBuffer> {
    const _inp = await inp
    let _result: ArrayBuffer
    if (typeof _inp === 'string') {
        _result = Uint8Array.from(atob(_inp), (c) => c.charCodeAt(0))
    } else {
        let _data
        const _finp = (_inp as KeyOutInterface).data
        if (
            _finp &&
            (_finp instanceof ArrayBuffer ||
                (_finp as any).buffer instanceof ArrayBuffer)
        ) {
            _data = _finp
        } else {
            _data = _inp
        }
        if (
            _data instanceof ArrayBuffer ||
            (_data as any).buffer instanceof ArrayBuffer
        ) {
            _result = _data as ArrayBuffer
        } else if (_data instanceof File) {
            _result = await (_data as File).arrayBuffer()
        } else if (_data instanceof CryptoKey) {
            if (!_data.extractable) {
                throw Error('Cannot extract key (extractable=false)')
            }
            switch (_data.type) {
                case 'public':
                    // serialize publicKey
                    _result = await crypto.subtle.exportKey(
                        'spki' as const,
                        _data
                    )
                    break
                case 'private':
                    _result = await crypto.subtle.exportKey(
                        'pkcs8' as const,
                        _data
                    )
                    break
                default:
                    _result = await crypto.subtle.exportKey(
                        'raw' as const,
                        _data
                    )
            }
        } else {
            throw Error(
                `Invalid input: ${_inp} (${(_inp as RawInput).constructor})`
            )
        }
    }
    return _result
}

export async function serializeToBase64(
    inp: RawInput | KeyOutInterface | PromiseLike<RawInput | KeyOutInterface>
): Promise<string> {
    return btoa(
        String.fromCharCode(
            ...new Uint8Array(await unserializeToArrayBuffer(inp))
        )
    )
}

function compareObjects(obj1: any, obj2: any) {
    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)])
    for (const key of keys) {
        if (obj1[key] != obj2[key]) {
            return false
        }
    }
    return true
}

export async function unserializeToCryptoKey(
    inp: KeyInput | PromiseLike<KeyInput>,
    params: any,
    type: 'privateKey' | 'publicKey' = 'publicKey'
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
            return await toPublicKey(temp1, params)
        }
        _data = await unserializeToArrayBuffer(temp1)
    } else if (
        (temp1 as CryptoKeyPair).privateKey &&
        (temp1 as CryptoKeyPair).publicKey
    ) {
        let temp2 = (temp1 as CryptoKeyPair)[type]
        if (compareObjects(temp2.algorithm, params)) {
            return temp2
        }
        _data = await unserializeToArrayBuffer(temp2)
    } else {
        _data = await unserializeToArrayBuffer(temp1 as RawInput)
    }
    if (params.name.startsWith('AES-')) {
        if (!mapEncryptionAlgorithms[params.name]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        // symmetric
        _result = await crypto.subtle.importKey(
            'raw' as const,
            _data,
            params,
            true,
            mapEncryptionAlgorithms[params.name].usages
        )
    } else {
        if (
            !mapEncryptionAlgorithms[`${params.name}private`] ||
            !mapEncryptionAlgorithms[`${params.name}public`]
        ) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        try {
            _result = await crypto.subtle.importKey(
                'pkcs8' as const,
                _data,
                params,
                true,
                mapEncryptionAlgorithms[`${params.name}private`].usages
            )
            if (type == 'publicKey') {
                _result = await toPublicKey(_result, params)
            }
        } catch (exc) {
            if (type == 'publicKey') {
                // serialize publicKey
                _result = await crypto.subtle.importKey(
                    'spki' as const,
                    _data,
                    params,
                    true,
                    mapEncryptionAlgorithms[`${params.name}public`].usages
                )
            } else {
                throw Error('Not a PrivateKey')
            }
        }
    }
    return _result
}

export async function encryptRSAOEAP(
    options: CryptoRSAInInterface | Promise<CryptoRSAInInterface>
): Promise<CryptoRSAOutInterface> {
    const _options = await options
    const hashalgo = await _options.hashAlgorithm
    if (!mapHashNames['' + hashalgo]) {
        throw Error('hashalgorithm not supported: ' + hashalgo)
    }
    const key = await unserializeToCryptoKey(_options.key, {
        name: 'RSA-OAEP',
        hash: mapHashNames['' + hashalgo].operationName,
    })
    return {
        data: await crypto.subtle.encrypt(
            {
                name: 'RSA-OAEP',
            },
            key,
            await unserializeToArrayBuffer(_options.data)
        ),
        hashAlgorithm: hashalgo as string,
        key,
    }
}

export async function decryptRSAOEAP(
    options: CryptoRSAInInterface | Promise<CryptoRSAInInterface>
): Promise<CryptoRSAOutInterface> {
    const _options = await options
    let hashValue = undefined,
        nonce: ArrayBuffer | undefined = undefined,
        key: CryptoKey
    const _key = await _options.key
    if (typeof _key === 'string') {
        const split = _key.split(':')
        let _hashalgo
        switch (split.length) {
            case 1:
                _hashalgo = await _options.hashAlgorithm
                hashValue = mapHashNames['' + _hashalgo]
                if (!hashValue) {
                    throw Error('hashalgorithm not supported: ' + _hashalgo)
                }
                key = await unserializeToCryptoKey(
                    split[0],
                    {
                        name: 'RSA-OAEP',
                        hash: hashValue.operationName,
                    },
                    'privateKey'
                )
                break
            case 2:
                _hashalgo = split[0]
                hashValue = mapHashNames['' + _hashalgo]
                if (!hashValue) {
                    throw Error('hashalgorithm not supported: ' + _hashalgo)
                }
                ;[nonce, key] = [
                    await unserializeToArrayBuffer(split[1]),
                    await unserializeToCryptoKey(
                        split[1],
                        {
                            name: 'RSA-OAEP',
                            hash: hashValue.operationName,
                        },
                        'privateKey'
                    ),
                ]
                break
            default:
                ;[_hashalgo, nonce] = [
                    split[0],
                    await unserializeToArrayBuffer(split[1]),
                ]
                hashValue = mapHashNames['' + _hashalgo]
                if (!hashValue) {
                    throw Error('hashalgorithm not supported: ' + _hashalgo)
                }
                key = await unserializeToCryptoKey(
                    split[2],
                    {
                        name: 'RSA-OAEP',
                        hash: hashValue.operationName,
                    },
                    'privateKey'
                )
                break
        }
    } else {
        const _hashalgo = await _options.hashAlgorithm
        hashValue = mapHashNames['' + _hashalgo]
        if (!hashValue) {
            Error('hashalgorithm not supported: ' + _hashalgo)
        }
        key = await unserializeToCryptoKey(
            _key,
            {
                name: 'RSA-OAEP',
                hash: hashValue.operationName,
            },
            'privateKey'
        )
    }
    return {
        data: await crypto.subtle.decrypt(
            {
                name: 'RSA-OAEP',
            },
            key,
            await unserializeToArrayBuffer(_options.data)
        ),
        key,
        hashAlgorithm: hashValue.serializedName,
        nonce,
    }
}

export async function encryptAESGCM(
    options: CryptoGCMInInterface | Promise<CryptoGCMInInterface>
): Promise<CryptoGCMOutInterface> {
    const _options = await options
    const nonce = _options.nonce
        ? await unserializeToArrayBuffer(_options.nonce)
        : crypto.getRandomValues(new Uint8Array(13))
    const key = await unserializeToCryptoKey(
        _options.key,
        {
            name: 'AES-GCM',
        },
        'publicKey'
    )
    const data = await unserializeToArrayBuffer(_options.data)
    return {
        data: await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: nonce,
            },
            key,
            data
        ),
        key,
        nonce,
    }
}
export async function decryptAESGCM(
    options: CryptoGCMInInterface | Promise<CryptoGCMInInterface>
): Promise<CryptoGCMOutInterface> {
    const _options = await options
    const _key = await _options.key
    const _nonce = _options.nonce
        ? await unserializeToArrayBuffer(_options.nonce)
        : undefined
    let nonce: ArrayBuffer, key: CryptoKey
    if (typeof _key === 'string') {
        const split = _key.split(':')
        switch (split.length) {
            case 1:
                if (!_nonce) {
                    throw Error('No nonce found')
                }
                nonce = _nonce
                key = await unserializeToCryptoKey(
                    split[0],
                    {
                        name: 'AES-GCM',
                    },
                    'privateKey'
                )
                break
            case 2:
                nonce = await unserializeToArrayBuffer(split[0])
                key = await unserializeToCryptoKey(
                    split[1],
                    {
                        name: 'AES-GCM',
                    },
                    'privateKey'
                )
                break
            default:
                nonce = await unserializeToArrayBuffer(split[1])
                key = await unserializeToCryptoKey(
                    split[2],
                    {
                        name: 'AES-GCM',
                    },
                    'privateKey'
                )
                break
        }
    } else {
        if (!_nonce) {
            throw Error('No nonce found')
        }
        nonce = _nonce
        key = await unserializeToCryptoKey(
            _key,
            {
                name: 'AES-GCM',
            },
            'privateKey'
        )
    }
    return {
        data: await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: nonce,
            },
            key,
            await unserializeToArrayBuffer(_options.data)
        ),
        key,
        nonce,
    }
}

export async function derivePW(
    options: PWInterface | PromiseLike<PWInterface>
): Promise<{ data: ArrayBuffer; key: CryptoKey }> {
    const _options = await options
    const key = await toPBKDF2key(_options.pw)
    const salt = await unserializeToArrayBuffer(_options.salt)
    const iterations = parseInt('' + (await _options.iterations))
    const _hashalgo = await _options.hashAlgorithm
    if (!mapHashNames['' + _hashalgo]) {
        throw Error('hashalgorithm not supported: ' + _hashalgo)
    }

    return {
        data: await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: iterations,
                hash: mapHashNames['' + _hashalgo].operationName,
            },
            key,
            256 // cap at 256 for AESGCM compatibility
        ),
        key: key,
    }
}

// use tag="" for no prefix (key=...)
export async function encryptTag(
    options: CryptoGCMInInterface & {
        readonly tag?: string | PromiseLike<string>
        readonly encrypt?: Set<string>
    }
) {
    let tag: string | undefined, data: CryptoGCMInInterface['data']
    if (options.tag !== undefined) {
        tag = await options.tag
        data = await options.data
    } else {
        const splitted = ((await options.data) as string).match(
            /^([^=]+)=(.*)/
        ) as string[]
        tag = splitted[1]
        data = splitted[2]
    }

    if (!options.encrypt || options.encrypt.has(tag)) {
        const nonce = crypto.getRandomValues(new Uint8Array(13))
        const { data: encrypted } = await encryptAESGCM({
            ...options,
            data,
            nonce,
        })
        const tmp = new Uint8Array(nonce.byteLength + encrypted.byteLength)
        tmp.set(new Uint8Array(nonce), 0)
        tmp.set(new Uint8Array(encrypted), nonce.byteLength)

        data = await serializeToBase64(tmp)
    }
    if (tag) {
        return `${tag}=${data as string}`
    }
    return data as string
}

export async function decryptTagRaw(options: CryptoGCMInInterface) {
    const data = await unserializeToArrayBuffer(options.data)
    const nonce = new Uint8Array(data.slice(0, 13))
    const realdata = data.slice(13)
    return await decryptAESGCM({
        ...options,
        data: realdata,
        nonce,
    })
}

export async function decryptTag(
    options: Omit<CryptoGCMInInterface, 'data'> & {
        readonly data: string | PromiseLike<string>
    }
) {
    const [_, tag, b64data] = (await options.data).match(
        /^([^=]+?)=(.*)/
    ) as string[]
    return {
        ...(await decryptTagRaw({ ...options, data: b64data })),
        tag,
    }
}

export async function extractTags(
    options: Omit<CryptoGCMInInterface, 'data'> & {
        readonly tags:
            | PromiseLike<Iterable<string | PromiseLike<string>>>
            | Iterable<string | PromiseLike<string>>
        readonly decrypt: Set<string>
    }
): Promise<{ [tag: string]: string[] }> {
    const tags: { [tag: string]: string[] } = {}
    await Promise.all(
        IterableOps.map(await options.tags, async (tag_val) => {
            const [_, tag, data] = (await tag_val).match(
                /(^[^=]+?)=(.*)/
            ) as string[]
            if (!tags[tag]) {
                tags[tag] = []
            }
            if (options.decrypt.has(tag)) {
                tags[tag].push(
                    (
                        await decryptTagRaw({ key: options.key, data })
                    ).data.toString()
                )
            } else {
                tags[tag].push(data)
            }
        })
    )
    return tags
}

export async function encryptPreKey({
    prekey,
    pw,
    hashAlgorithm,
    iterations,
}: {
    prekey: ArrayBuffer
    pw: NonKeyInput
    hashAlgorithm: string
    iterations: number
}) {
    const nonce = crypto.getRandomValues(new Uint8Array(13))
    const key = (await derivePW({ pw, salt: nonce, hashAlgorithm, iterations }))
        .data
    const { data } = await encryptAESGCM({
        nonce,
        key,
        data: prekey,
    })
    return `${btoa(String.fromCharCode(...nonce))}${btoa(
        String.fromCharCode(...new Uint8Array(data))
    )}`
}

async function _pwsdecryptprekey(options: {
    readonly prekey: ArrayBuffer | string
    pws: NonKeyInput[]
    hashAlgorithm: string
    iterations: number | string
}) {
    let prefix = null,
        prekey
    if (typeof options.prekey === 'string') {
        const _prekey = options.prekey.split(':', 1)
        if (_prekey.length > 1) {
            prefix = _prekey[0]
            prekey = Uint8Array.from(atob(_prekey[1]), (c) => c.charCodeAt(0))
        } else {
            prekey = Uint8Array.from(atob(_prekey[0]), (c) => c.charCodeAt(0))
        }
    } else {
        prekey = options.prekey
    }
    const nonce = new Uint8Array(prekey.slice(0, 13))
    const realkey = prekey.slice(13)
    const decryptprocesses = []
    for (const pw of options.pws) {
        decryptprocesses.push(
            decryptAESGCM({
                data: realkey,
                key: (
                    await derivePW({
                        pw,
                        salt: nonce,
                        hashAlgorithm: options.hashAlgorithm,
                        iterations: options.iterations,
                    })
                ).data,
                nonce: nonce,
            })
        )
    }
    return [await Promise.any(decryptprocesses).then((obj) => obj.data), prefix]
}

export async function decryptPreKeys(options: {
    prekeys: ArrayBuffer[] | string[]
    pws: NonKeyInput[]
    hashAlgorithm: string
    iterations: number | string
}) {
    const decryptprocesses = []
    for (const prekey of options.prekeys) {
        decryptprocesses.push(_pwsdecryptprekey({ ...options, prekey }))
    }
    const results = []
    for (const res of await Promise.allSettled(decryptprocesses)) {
        if ((res as any)['value']) {
            results.push(
                (res as PromiseFulfilledResult<[ArrayBuffer, string | null]>)
                    .value
            )
        }
    }
    return results
}

export async function decryptFirstPreKey(options: {
    prekeys: ArrayBuffer[] | string[]
    pws: NonKeyInput[]
    hashAlgorithm: string
    iterations: number | string
    fn?: any
}) {
    const decryptprocesses = []
    for (const prekey of options.prekeys) {
        if (options.fn) {
            decryptprocesses.push(
                _pwsdecryptprekey({ ...options, prekey }).then(options.fn)
            )
        } else {
            decryptprocesses.push(_pwsdecryptprekey({ ...options, prekey }))
        }
    }
    return await Promise.any(decryptprocesses)
}
