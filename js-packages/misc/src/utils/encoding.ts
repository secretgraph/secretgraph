import * as Interfaces from '../interfaces'
import { MaybePromise } from '../typing'

export const utf8encoder = new TextEncoder()
export const utf8decoder = new TextDecoder()

export function utf8ToBinary(inp: string): string {
    return String.fromCharCode(...utf8encoder.encode(inp))
}

export class Base64Error extends Error {}

export function b64tobuffer(inp: string) {
    const tmp = Buffer.from(inp, 'base64')

    // if smaller than lower limit, raise an exception
    if (inp.length && (Math.floor(tmp.byteLength / 3) + 1) * 4 < inp.length) {
        throw new Base64Error('Not a base64 string: ' + inp)
    }

    // in case byteOffset is 0 just use tmp.buffer, otherwise slice
    return tmp.byteOffset == 0
        ? tmp.buffer
        : tmp.buffer.slice(tmp.byteOffset, tmp.byteOffset + tmp.byteLength)
}

export function b64toarr(inp: string) {
    return new Uint8Array(b64tobuffer(inp))
}
export function b64toutf8(inp: string) {
    return utf8decoder.decode(b64toarr(inp))
}

export async function unserializeToArrayBuffer(
    inp: MaybePromise<Interfaces.RawInput | Interfaces.KeyOutInterface>
): Promise<ArrayBuffer> {
    const _inp = await inp
    let _result: ArrayBuffer
    if (typeof _inp === 'string') {
        _result = b64tobuffer(_inp)
    } else {
        let _data
        // check if keyout by faking type
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
    inp: MaybePromise<Interfaces.RawInput | Interfaces.KeyOutInterface>
): Promise<string> {
    return Buffer.from(await unserializeToArrayBuffer(inp)).toString('base64')
}

export function splitFirstOnly(inp: string): [string, string] {
    const matches = inp.match(/([^:]*):(.*)/)
    if (!matches) {
        return ['', inp]
    }
    return [matches[1], matches[2]]
}
export function splitFirstTwoOnly(inp: string): [string, string, string] {
    const splitted = splitFirstOnly(inp)
    const splitted2 = splitFirstOnly(splitted[1])
    return [splitted[0], splitted2[0], splitted2[1]]
}

export function splitLastOnly(inp: string): [string, string] {
    const matches = inp.match(/(.*):([^:]*)$/)
    if (!matches) {
        return ['', inp]
    }
    return [matches[1], matches[2]]
}

export function fromGraphqlId(gid: string): [string, string] | null {
    try {
        const rawTxt = utf8decoder.decode(b64tobuffer(gid))
        return splitFirstOnly(rawTxt)
    } catch (exc) {
        console.debug('error parsing id', gid, exc)
    }
    return null
}

export function toGraphqlId(type: string, rid: string) {
    return Buffer.from(`${type}:${rid}`, 'utf-8').toString('base64')
}

export class InvalidPrefix extends Error {}

export function checkPrefix(
    inp: string | null | undefined | (string | null)[],
    options: { prefix: string; nonEmpty?: boolean; b64?: boolean }
) {
    if (inp instanceof Array) {
        for (const elem of inp) {
            checkPrefix(elem, options)
        }
    } else {
        if (!inp) {
            if (options.nonEmpty) {
                throw new InvalidPrefix(
                    `Input empty: ${inp}, prefix: ${options.prefix}`
                )
            }
            return
        }
        if (options.b64) {
            inp = utf8decoder.decode(b64tobuffer(inp))
        }
        if (!inp.startsWith(options.prefix)) {
            throw new InvalidPrefix(
                `Input doesn't match: ${inp}, prefix: ${options.prefix}`
            )
        }
    }
}
