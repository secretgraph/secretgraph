import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import * as Hashing from './hashing'
import * as IterableOps from './iterable'

export const utf8encoder = new TextEncoder()
export const utf8decoder = new TextDecoder()

export function utf8ToBinary(inp: string): string {
    return String.fromCharCode(...utf8encoder.encode(inp))
}

export class Base64Error extends Error {}

export function b64tobuffer(inp: string) {
    const tmp = Buffer.from(inp, 'base64')

    if (tmp.byteLength == 0 && inp.length) {
        throw new Base64Error('Not a base64 string')
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
    inp:
        | Interfaces.RawInput
        | Interfaces.KeyOutInterface
        | PromiseLike<Interfaces.RawInput | Interfaces.KeyOutInterface>
): Promise<ArrayBuffer> {
    const _inp = await inp
    let _result: ArrayBuffer
    if (typeof _inp === 'string') {
        _result = b64tobuffer(_inp)
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
