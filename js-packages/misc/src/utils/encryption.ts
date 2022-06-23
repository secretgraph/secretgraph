import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import * as IterableOps from './iterable'
import { utf8encoder } from './misc'

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
    return await serializeToBase64(
        crypto.subtle.digest(hashAlgorithm, await unserializeToArrayBuffer(obj))
    )
}

export async function toPBKDF2key(
    inp: Interfaces.RawInput | PromiseLike<Interfaces.RawInput>
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
            `Invalid input: ${_inp} (${
                (_inp as Interfaces.RawInput).constructor
            })`
        )
    }

    return crypto.subtle.importKey(
        'raw',
        data,
        'PBKDF2',
        false,
        Constants.mapEncryptionAlgorithms.PBKDF2.usages
    )
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
        if (!Constants.mapEncryptionAlgorithms[params.name]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        return await crypto.subtle.importKey(
            'raw' as const,
            await unserializeToArrayBuffer(_inp as Interfaces.RawInput),
            params,
            true,
            Constants.mapEncryptionAlgorithms[params.name].usages
        )
    } else {
        if (!Constants.mapEncryptionAlgorithms[`${params.name}private`]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        _key = await crypto.subtle.importKey(
            'pkcs8' as const,
            await unserializeToArrayBuffer(_inp as Interfaces.RawInput),
            params,
            true,
            Constants.mapEncryptionAlgorithms[`${params.name}private`].usages
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
    if (!Constants.mapEncryptionAlgorithms[`${params.name}public`]) {
        throw Error(
            `Public version not available, should not happen: ${
                params.name
            } (private: ${
                Constants.mapEncryptionAlgorithms[`${params.name}private`]
            })`
        )
    }
    return await crypto.subtle.importKey(
        'jwk',
        tempkey,
        params,
        true,
        Constants.mapEncryptionAlgorithms[`${params.name}public`].usages
    )
}

export async function unserializeToArrayBuffer(
    inp:
        | Interfaces.RawInput
        | Interfaces.KeyOutInterface
        | PromiseLike<Interfaces.RawInput | Interfaces.KeyOutInterface>
): Promise<ArrayBuffer> {
    const _inp = await inp
    let _result: ArrayBuffer
    if (typeof _inp === 'string') {
        _result = Buffer.from(_inp, 'base64').buffer
    } else {
        let _data
        const _finp = (_inp as Interfaces.KeyOutInterface).data
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
        } else if (_data instanceof Blob) {
            _result = await (_data as Blob).arrayBuffer()
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
                `Invalid input: ${_inp} (${
                    (_inp as Interfaces.RawInput).constructor
                })`
            )
        }
    }
    return _result
}

export async function serializeToBase64(
    inp:
        | Interfaces.RawInput
        | Interfaces.KeyOutInterface
        | PromiseLike<Interfaces.RawInput | Interfaces.KeyOutInterface>
): Promise<string> {
    return Buffer.from(await unserializeToArrayBuffer(inp)).toString('base64')
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

class KeyTypeError extends Error {}
class EmptyKeyError extends Error {}
class UnknownAlgorithm extends Error {}

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
        if (!Constants.mapEncryptionAlgorithms[params.name]) {
            throw Error('Algorithm not supported: ' + params.name)
        }
        // symmetric
        _result = await crypto.subtle.importKey(
            'raw' as const,
            _data,
            params,
            true,
            Constants.mapEncryptionAlgorithms[params.name].usages
        )
    } else {
        if (
            !Constants.mapEncryptionAlgorithms[`${params.name}private`] ||
            !Constants.mapEncryptionAlgorithms[`${params.name}public`]
        ) {
            throw new UnknownAlgorithm(
                `Algorithm not supported: ${params.name}`
            )
        }
        try {
            _result = await crypto.subtle.importKey(
                'pkcs8' as const,
                _data,
                params,
                true,
                Constants.mapEncryptionAlgorithms[`${params.name}private`]
                    .usages
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
                        'spki' as const,
                        _data,
                        params,
                        true,
                        Constants.mapEncryptionAlgorithms[
                            `${params.name}public`
                        ].usages
                    )
                } catch (exc_inner) {
                    console.debug(
                        'error importing, parameters: ',
                        params,
                        _data,
                        Constants.mapEncryptionAlgorithms[
                            `${params.name}public`
                        ].usages,
                        exc_inner.stack
                    )
                    throw exc_inner
                }
            } else {
                console.debug(
                    'error invalid, parameters: ',
                    params,
                    _data,
                    Constants.mapEncryptionAlgorithms[`${params.name}public`],
                    exc.stack
                )
                throw Error('Not a PrivateKey')
            }
        }
    }
    return _result
}

export async function encryptRSAOEAP(
    options:
        | Interfaces.CryptoRSAInInterface
        | Promise<Interfaces.CryptoRSAInInterface>
): Promise<Interfaces.CryptoRSAOutInterface> {
    const _options = await options
    const hashalgo = await _options.hashAlgorithm
    if (!Constants.mapHashNames['' + hashalgo]) {
        throw Error('hashalgorithm not supported: ' + hashalgo)
    }
    const key = await unserializeToCryptoKey(_options.key, {
        name: 'RSA-OAEP',
        hash: Constants.mapHashNames['' + hashalgo].operationName,
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
    options:
        | Interfaces.CryptoRSAInInterface
        | Promise<Interfaces.CryptoRSAInInterface>
): Promise<Interfaces.CryptoRSAOutInterface> {
    const _options = await options
    let hashValue = undefined,
        nonce: ArrayBuffer | undefined = undefined,
        key: CryptoKey
    const _key = await _options.key
    let _data = await _options.data
    const split = typeof _data == 'string' ? _data.split(':') : [_data]
    let _hashalgo
    switch (split.length) {
        case 1:
            _hashalgo = await _options.hashAlgorithm
            _data = split[0]
            hashValue = Constants.mapHashNames['' + _hashalgo]
            if (!hashValue) {
                throw Error('hashalgorithm not supported: ' + _hashalgo)
            }
            key = await unserializeToCryptoKey(
                _key,
                {
                    name: 'RSA-OAEP',
                    hash: hashValue.operationName,
                },
                'privateKey'
            )
            break
        case 2:
            _hashalgo = split[0]
            _data = split[1]
            hashValue = Constants.mapHashNames['' + _hashalgo]
            if (!hashValue) {
                throw Error('hashalgorithm not supported: ' + _hashalgo)
            }
            ;[nonce, key] = [
                await unserializeToArrayBuffer(split[1]),
                await unserializeToCryptoKey(
                    _key,
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
            hashValue = Constants.mapHashNames['' + _hashalgo]
            if (!hashValue) {
                throw Error('hashalgorithm not supported: ' + _hashalgo)
            }
            key = await unserializeToCryptoKey(
                _key,
                {
                    name: 'RSA-OAEP',
                    hash: hashValue.operationName,
                },
                'privateKey'
            )
            break
    }
    return {
        data: await crypto.subtle.decrypt(
            {
                name: 'RSA-OAEP',
            },
            key,
            await unserializeToArrayBuffer(_data)
        ),
        key,
        hashAlgorithm: hashValue.serializedName,
        nonce,
    }
}

export async function encryptAESGCM(
    options:
        | Interfaces.CryptoGCMInInterface
        | Promise<Interfaces.CryptoGCMInInterface>
): Promise<Interfaces.CryptoGCMOutInterface> {
    const _options = await options
    const nonce = _options.nonce
        ? await unserializeToArrayBuffer(_options.nonce)
        : crypto.getRandomValues(new Uint8Array(13))
    const key = await unserializeToCryptoKey(
        _options.key,
        {
            name: 'AES-GCM',
        },
        'privateKey' // secret so private key
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
    options:
        | Interfaces.CryptoGCMInInterface
        | Promise<Interfaces.CryptoGCMInInterface>
): Promise<Interfaces.CryptoGCMOutInterface> {
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
    let data
    try {
        data = await unserializeToArrayBuffer(_options.data)
        if (!data || data.byteLength == 0) {
            data = new Uint8Array()
        } else {
            data = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: nonce,
                },
                key,
                data
            )
        }
        return {
            data,
            key,
            nonce,
        }
    } catch (exc) {
        console.debug('error, parameters: ', key, nonce, data)
        throw exc
    }
}

export async function derivePW(
    options: Interfaces.PWInterface | PromiseLike<Interfaces.PWInterface>
): Promise<{ data: ArrayBuffer; key: CryptoKey }> {
    const _options = await options
    const key = await toPBKDF2key(_options.pw)
    const salt = await unserializeToArrayBuffer(_options.salt)
    const iterations = parseInt('' + (await _options.iterations))
    const _hashalgo = await _options.hashAlgorithm
    if (!Constants.mapHashNames['' + _hashalgo]) {
        throw Error('hashalgorithm not supported: ' + _hashalgo)
    }

    return {
        data: await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: iterations,
                hash: Constants.mapHashNames['' + _hashalgo].operationName,
            },
            key,
            256 // cap at 256 for AESGCM compatibility
        ),
        key,
    }
}

// use tag="" for flags
export async function encryptTag(
    options: Interfaces.CryptoGCMInInterface & {
        readonly tag?: string | PromiseLike<string>
        readonly encrypt?: Set<string>
    }
): Promise<string> {
    let tag: string | undefined,
        data: Exclude<Interfaces.CryptoGCMInInterface['data'], 'PromiseLike'>
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
    if (!data) {
        throw Error('missing data')
    }

    if (options.encrypt && options.encrypt.has(tag)) {
        const nonce = crypto.getRandomValues(new Uint8Array(13))
        let encrypted
        try {
            encrypted = (
                await encryptAESGCM({
                    ...options,
                    data,
                    nonce,
                })
            )['data']
        } catch (e) {
            console.debug('error encrypting tag', data, nonce)
            throw e
        }
        const tmp = new Uint8Array(nonce.byteLength + encrypted.byteLength)
        // TODO: new Uint8Array required?
        tmp.set(new Uint8Array(nonce), 0)
        tmp.set(new Uint8Array(encrypted), nonce.byteLength)
        data = await serializeToBase64(tmp)
        /**console.log(
            tag,
            await serializeToBase64(options.key as ArrayBuffer),
            String.fromCharCode(
                ...new Uint8Array(
                    (
                        await decryptTagRaw({
                            data,
                            key: options.key,
                        })
                    ).data
                )
            )
        )*/
    }
    if (!tag) {
        // for flags
        return data as string
    }
    return `${tag}=${data as string}`
}

export async function deparseTag(options: {
    readonly data: Interfaces.RawInput | PromiseLike<Interfaces.RawInput>
    readonly tag?: string | PromiseLike<string>
    readonly encrypt?: Set<string>
}): Promise<string> {
    let tag: string | undefined,
        data: Exclude<Interfaces.CryptoGCMInInterface['data'], 'PromiseLike'>
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
    if (!data) {
        throw Error('missing data')
    }

    if (options.encrypt && options.encrypt.has(tag)) {
        try {
            tag = String.fromCharCode(
                ...new Uint8Array(await unserializeToArrayBuffer(data))
            )
        } catch (e) {
            console.debug('error deparsing tag', data)
        }
    }
    if (!tag) {
        // for flags
        return data as string
    }
    return `${tag}=${data as string}`
}

export async function decryptTagRaw(
    options: Interfaces.CryptoGCMInInterface
): Promise<{ data: ArrayBufferLike; encrypted: boolean }> {
    let data
    try {
        data = await unserializeToArrayBuffer(options.data)
    } catch (error) {
        return {
            data: utf8encoder.encode(options.data as string),
            encrypted: false,
        }
    }
    const nonce = new Uint8Array(data.slice(0, 13))
    const realdata = data.slice(13)
    return {
        data: (
            await decryptAESGCM({
                ...options,
                data: realdata,
                nonce,
            })
        ).data,
        encrypted: true,
    }
}

export async function decryptTag(
    options: Omit<Interfaces.CryptoGCMInInterface, 'data'> & {
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

export async function extractUnencryptedTags(options: {
    readonly tags:
        | PromiseLike<Iterable<string | PromiseLike<string>>>
        | Iterable<string | PromiseLike<string>>
}): Promise<{ [tag: string]: string[] }> {
    const tags: { [tag: string]: string[] } = {}
    await Promise.all(
        IterableOps.map(await options.tags, async (_tag_val) => {
            const tag_val = await _tag_val
            const res = tag_val.match(/(^[^=]+?)=(.*)/)
            if (res) {
                const [_, tag, data] = res
                if (!tags[tag]) {
                    tags[tag] = []
                }
                tags[tag].push(data)
            } else {
                if (!tags[tag_val]) {
                    tags[tag_val] = []
                }
            }
        })
    )
    return tags
}

export async function extractTags(
    options: Omit<Interfaces.CryptoGCMInInterface, 'data'> & {
        readonly tags:
            | PromiseLike<Iterable<string | PromiseLike<string>>>
            | Iterable<string | PromiseLike<string>>
        readonly decrypt: Set<string>
    }
): Promise<{ tags: { [tag: string]: string[] }; encryptedTags: Set<string> }> {
    const tags: { [tag: string]: string[] } = {}
    const encryptedTags = new Set<string>()
    await Promise.all(
        IterableOps.map(await options.tags, async (_tag_val) => {
            const tag_val = await _tag_val
            const res = tag_val.match(/(^[^=]+?)=(.*)/)
            if (res) {
                const [_, tag, data] = res
                if (!tags[tag]) {
                    tags[tag] = []
                }
                if (options.decrypt.has(tag)) {
                    try {
                        const val = await decryptTagRaw({
                            key: options.key,
                            data,
                        })
                        tags[tag].push(
                            String.fromCharCode(...new Uint8Array(val.data))
                        )
                        if (val.encrypted) {
                            encryptedTags.add(tag)
                        }
                    } catch (error) {
                        console.info('decrypting tag failed', tag, error)
                    }
                } else {
                    tags[tag].push(data)
                }
            } else {
                if (!tags[tag_val]) {
                    tags[tag_val] = []
                }
            }
        })
    )
    return { tags, encryptedTags }
}

export async function encryptPreKey({
    prekey,
    pw,
    hashAlgorithm,
    iterations,
}: {
    prekey: ArrayBuffer
    pw: Interfaces.NonKeyInput
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
    const ret = Buffer.concat([nonce, new Uint8Array(data)]).toString('base64')
    if (ret.length <= 23) {
        throw new EmptyKeyError('prekey is too short <= 3 bytes')
    }
    return ret
}

async function _pwsdecryptprekey(options: {
    readonly prekey: ArrayBuffer | string
    pws: Interfaces.NonKeyInput[]
    hashAlgorithm: string
    iterations: number | string
}): Promise<[ArrayBuffer, string | null]> {
    let prefix = null,
        prekey
    if (typeof options.prekey === 'string') {
        const _prekey = options.prekey.split(':', 2)
        if (_prekey.length > 1) {
            prefix = _prekey[0]
            prekey = Buffer.from(_prekey[1], 'base64').buffer
        } else {
            prekey = Buffer.from(_prekey[0], 'base64').buffer
        }
    } else {
        prekey = options.prekey
    }
    const nonce = new Uint8Array(prekey.slice(0, 13))
    if (!nonce.length) {
        console.error('nonce part error', nonce, new Uint8Array(prekey))
        throw new EmptyKeyError('nonce part of pre key empty')
    }
    const realkey = new Uint8Array(prekey.slice(13))
    if (!realkey.length) {
        console.error('realkey error', realkey, new Uint8Array(prekey))
        throw new EmptyKeyError('real part of pre key empty')
    }
    const decryptprocesses = []
    for (const pw of options.pws) {
        decryptprocesses.push(
            decryptAESGCM({
                data: realkey,
                // pw hash uses nonce of prekey as salt
                key: derivePW({
                    pw,
                    salt: nonce,
                    hashAlgorithm: options.hashAlgorithm,
                    iterations: options.iterations,
                }).then(
                    (result) => {
                        return result.data
                    },
                    (reason) => {
                        console.warn('Deriving pw failed', reason)
                        return Promise.reject(reason)
                    }
                ),
                nonce,
            })
        )
    }
    return [
        await Promise.any(decryptprocesses).then((obj) => {
            return obj.data
        }, Promise.reject),
        prefix,
    ]
}

export async function decryptPreKeys(options: {
    prekeys: (ArrayBuffer | string)[]
    pws: Interfaces.NonKeyInput[]
    hashAlgorithm: string
    iterations: number | string
}): Promise<[ArrayBuffer, string | null][]> {
    const decryptprocesses = []
    for (const prekey of options.prekeys) {
        decryptprocesses.push(_pwsdecryptprekey({ ...options, prekey }))
    }
    const results: [ArrayBuffer, string | null][] = []
    for (const res of await Promise.allSettled(decryptprocesses)) {
        if (res.status == 'fulfilled') {
            results.push(res.value)
        }
    }
    return results
}

export async function decryptFirstPreKey<
    T = [ArrayBuffer, string | null]
>(options: {
    prekeys: ArrayBuffer[] | string[]
    pws: Interfaces.NonKeyInput[]
    hashAlgorithm: string
    iterations: number | string
    fn?: (a: [ArrayBuffer, string | null]) => T
}): Promise<T> {
    const decryptprocesses: PromiseLike<T>[] = []
    for (const prekey of options.prekeys) {
        if (options.fn) {
            decryptprocesses.push(
                _pwsdecryptprekey({ ...options, prekey }).then(options.fn)
            )
        } else {
            decryptprocesses.push(
                _pwsdecryptprekey({ ...options, prekey }) as PromiseLike<any>
            )
        }
    }
    return await Promise.any(decryptprocesses)
}

export async function authInfoFromTokens({
    tokens,
    hashAlgorithms,
    certificateHashes,
}: {
    tokens: string[]
    hashAlgorithms: Set<string> | string
    certificateHashes: string[]
}): Promise<Interfaces.AuthInfoInterface> {
    if (typeof hashAlgorithms == 'string') {
        hashAlgorithms = new Set(hashAlgorithms)
    }
    const hashes = []
    // sorted is better for cache

    for (const hashAlgorithm of hashAlgorithms) {
        for (const token of tokens) {
            hashes.push(hashObject(token, hashAlgorithm))
        }
    }
    return {
        certificateHashes,
        hashes: (await Promise.all(hashes)).sort(),
        tokens: [...tokens].sort(),
        types: new Set(),
    }
}
