import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import {
    Base64Error,
    b64tobuffer,
    serializeToBase64,
    unserializeToArrayBuffer,
    utf8encoder,
    splitFirstOnly,
    splitLastOnly,
} from './encoding'
import { hashObject, hashToken } from './hashing'
import { MaybePromise } from '../typing'
import {
    mapDeriveAlgorithms,
    mapEncryptionAlgorithms,
    mapSignatureAlgorithms,
    EmptyKeyError,
    decryptString,
    encryptString,
    derive,
    deriveString,
    encrypt,
    serializeDerive,
} from './crypto'
import * as IterableOps from './iterable'

/// new

/// old

// encrypt ~ prefixed tags, return tag as wellformed tag string
// use tag="" for flags
export async function finalizeTag(options: {
    readonly key: MaybePromise<any>
    readonly data: MaybePromise<string>
    readonly tag?: MaybePromise<string>
}): Promise<string> {
    let tag: string | undefined, data: ArrayBuffer | string
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

    if (tag.startsWith('~')) {
        const nonce = crypto.getRandomValues(new Uint8Array(13))
        try {
            data = await encryptString(options.key, data, {
                algorithm: 'AESGCM',
            })
        } catch (e) {
            console.debug('error encrypting tag', data, nonce)
            throw e
        }
    }
    if (!tag) {
        // for flags
        return data
    }
    return `${tag}=${data}`
}

// decrypt tag part after =
export async function decryptTagRaw(options: {
    readonly key: any
    readonly data: string
}): Promise<ArrayBuffer> {
    return (await decryptString(options.key, options.data)).data
}

// decrypt tag
export async function decryptTag(options: {
    readonly key: any
    readonly data: string
}): Promise<{ data: string; success: boolean; tag: string }> {
    const [_, tag, b64data] = (await options.data).match(
        /^([^=]+?)=(.*)/
    ) as string[]
    try {
        return {
            data: String.fromCharCode(
                ...new Uint8Array(
                    await decryptTagRaw({ ...options, data: b64data })
                )
            ),
            success: true,
            tag,
        }
    } catch (error) {
        if (error instanceof Base64Error) {
            console.warn('Error decoding tag, base64 decoding failed', error)
        } else {
            console.warn('Error decoding tag', error)
        }
        return {
            data: b64data,
            success: false,
            tag,
        }
    }
}

// extrac tags into an object, don't decrypt
export async function extractTagsRaw(options: {
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

// extract encrypted and unencrypted tags into an object
export async function extractTags(options: {
    readonly key: MaybePromise<any>
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
                if (tag.startsWith('~')) {
                    try {
                        const val = await decryptTagRaw({
                            key: options.key,
                            data,
                        })
                        tags[tag].push(
                            String.fromCharCode(...new Uint8Array(val))
                        )
                    } catch (error) {
                        console.error(
                            'decrypting tag caused error',
                            tag,
                            error
                        )
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
    return tags
}

// key for unlocking private key/config
export async function encryptPreKey({
    prekey,
    pw,
    deriveAlgorithm,
    params,
}: {
    prekey: ArrayBuffer
    pw: Interfaces.NonKeyInput
    deriveAlgorithm: string
    params?: any
}) {
    const result = await derive(await unserializeToArrayBuffer(pw), {
        algorithm: deriveAlgorithm,
        params,
    })
    const prefix = Buffer.from(
        splitLastOnly(await serializeDerive(result))[0]
    ).toString('base64')
    // TODO: merge PKDF2 and AESGCM serialize
    return `${prefix}:${await encryptString(result.data, prekey, {
        algorithm: 'AESGCM',
    })}`
}

async function _pwsdecryptprekey(options: {
    readonly prekey: string
    pws: string[]
}): Promise<[ArrayBuffer, string | null]> {
    const splitted = splitFirstOnly(options.prekey)
    const derivePrefix = Buffer.from(splitted[0], 'base64').toString('utf8')

    const decryptprocesses = []
    for (const pw of options.pws) {
        decryptprocesses.push(
            decryptString(
                (await derive(`${derivePrefix}:${pw}`)).data,
                splitted[1]
            ).then(
                (result) => {
                    return result.data
                },
                (reason) => {
                    console.warn('Deriving pw failed', reason)
                    return Promise.reject(reason)
                }
            )
        )
    }
    return await Promise.any(decryptprocesses)
}

// key for unlocking private key/config
export async function decryptPreKeys({
    ...options
}: {
    prekeys: (ArrayBuffer | string)[]
    pws: Interfaces.NonKeyInput[]
}): Promise<[ArrayBuffer, string | null][]> {
    const decryptprocesses = []
    for (const prekey of options.prekeys) {
        decryptprocesses.push(
            _pwsdecryptprekey({
                ...options,
                prekey,
            })
        )
    }
    const results: [ArrayBuffer, string | null][] = []
    for (const res of await Promise.allSettled(decryptprocesses)) {
        if (res.status == 'fulfilled') {
            results.push(res.value)
        }
    }
    return results
}

// key for unlocking private key/config
export async function decryptFirstPreKey<T = [ArrayBuffer, string | null]>({
    fallbackHashAlgorithm,
    ...options
}: {
    prekeys: ArrayBuffer[] | string[]
    pws: Interfaces.NonKeyInput[]
    fallbackHashAlgorithm: string
    iterations: number | string
    fn?: (a: [ArrayBuffer, string | null]) => T
}): Promise<T> {
    const decryptprocesses: PromiseLike<T>[] = []
    for (const prekey of options.prekeys) {
        if (options.fn) {
            decryptprocesses.push(
                _pwsdecryptprekey({
                    ...options,
                    prekey,
                    hashAlgorithm: fallbackHashAlgorithm,
                }).then(options.fn)
            )
        } else {
            decryptprocesses.push(
                _pwsdecryptprekey({
                    ...options,
                    prekey,
                    hashAlgorithm: fallbackHashAlgorithm,
                }) as PromiseLike<any>
            )
        }
    }
    return await Promise.any(decryptprocesses)
}

export async function authInfoFromTokens({
    tokens,
    hashAlgorithms,
    certificateHashes,
    limit,
}: {
    tokens: string[]
    hashAlgorithms: Set<string> | string
    certificateHashes: string[]
    limit?: number
}): Promise<Interfaces.AuthInfoInterface> {
    let limitReached = false
    if (limit && tokens.length > limit) {
        limitReached = true
        tokens = tokens.slice(0, limit)
    } else if (limit === undefined && tokens.length > 100) {
        limitReached = true
        tokens = tokens.slice(0, 100)
    }
    if (typeof hashAlgorithms == 'string') {
        hashAlgorithms = new Set(hashAlgorithms)
    }
    const hashes = []
    // sorted is better for cache

    for (const hashAlgorithm of hashAlgorithms) {
        for (const token of tokens) {
            hashes.push(hashToken(token, hashAlgorithm))
        }
    }
    if (limitReached && limit === undefined) {
        console.warn('Warning: tokens are capped as limit of 100 is reached')
    }
    return {
        certificateHashes,
        tokenHashes: (await Promise.all(hashes)).sort(),
        tokens: [...tokens].sort(),
        types: new Set(),
        limitReached,
    }
}
