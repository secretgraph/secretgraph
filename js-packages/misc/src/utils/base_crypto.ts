import {
    unserializeToArrayBuffer,
    serializeToBase64,
    splitFirstOnly,
} from './encoding'
import { ValueType } from '../typing'

export function addWithVariants<T extends { [key: string]: any }>(
    obj: T,
    newEntry: ValueType<T>,
    variants: string[]
) {
    for (const variant of variants) {
        ;(obj as any)[variant] = newEntry
    }
}

export let DEFAULT_SIGNATURE_ALGORITHM = 'rsa-sha512'
export let DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM = 'rsa-sha512'
export let DEFAULT_SYMMETRIC_ENCRYPTION_ALGORITHM = 'AESGCM'
export let DEFAULT_DERIVE_ALGORITHM = 'PBKDF2-sha512'

export type ParamsType = any
export type KeyType = any

export interface CryptoResult {
    data: ArrayBuffer
    params: ParamsType
}

export interface KeyResult {
    key: KeyType
    params: ParamsType
}

export interface OptionalCryptoResult {
    data?: ArrayBuffer
    params: ParamsType
}

export async function defaultDeserialize(
    inp: string,
    params?: ParamsType
): Promise<CryptoResult> {
    const match = inp.match(/^:*(.*?)$/) as string[]
    return {
        data: await unserializeToArrayBuffer(match[1]),
        params: params || {},
    }
}

export async function defaultSerializeParams(
    params: ParamsType
): Promise<string> {
    return ''
}
// argon1id, pkb
export const mapDeriveAlgorithms: {
    [algo: string]: {
        readonly derive: (
            inp: ArrayBuffer,
            params?: ParamsType
        ) => Promise<CryptoResult>
        readonly deserialize: (
            inp: string,
            params?: ParamsType
        ) => Promise<CryptoResult>
        readonly serialize: (inp: {
            data: ArrayBuffer
            params: ParamsType
        }) => Promise<string>
        readonly serializedName: string
        readonly type: 'hash' | 'derive'
    }
} = {}

export const mapEncryptionAlgorithms: {
    [algo: string]: {
        // encrypt serializes
        readonly encrypt: (
            key: KeyType,
            data: ArrayBuffer,
            params: ParamsType
        ) => Promise<CryptoResult>
        readonly decrypt: (
            key: KeyType,
            data: ArrayBuffer,
            params: ParamsType
        ) => Promise<CryptoResult>
        readonly generateKey: (params: ParamsType) => Promise<KeyResult>
        readonly serializeParams: (params: ParamsType) => Promise<string>
        readonly deserialize: (
            inp: string,
            params?: ParamsType
        ) => Promise<OptionalCryptoResult>
        readonly serializedName: string
        readonly keyParams: any
        readonly type: 'symmetric' | 'asymmetric'
    }
} = {}
export const mapSignatureAlgorithms: {
    [algo: string]: {
        // sign serializes
        readonly sign: (key: KeyType, data: ArrayBuffer) => Promise<string>
        readonly verify: (
            key: KeyType,
            signature: string,
            data: ArrayBuffer
        ) => Promise<boolean>
        readonly generateKey: (params: ParamsType) => Promise<KeyResult>
        readonly serializedName: string
        readonly keyParams: any
    }
} = {}
addWithVariants(
    mapDeriveAlgorithms,
    {
        derive: async (inp: ArrayBuffer) => {
            return {
                data: await crypto.subtle.digest('SHA-256', inp),
                params: {},
            }
        },
        deserialize: defaultDeserialize,
        serialize: async (inp) => {
            return await serializeToBase64(inp.data)
        },
        serializedName: 'sha256',
        type: 'hash',
    },
    ['sha256', 'SHA-256']
)
addWithVariants(
    mapDeriveAlgorithms,
    {
        derive: async (inp: ArrayBuffer) => {
            return {
                data: await crypto.subtle.digest('SHA-512', inp),
                params: {},
            }
        },
        deserialize: defaultDeserialize,
        serialize: async (inp) => {
            return await serializeToBase64(inp.data)
        },
        serializedName: 'sha512',
        type: 'hash',
    },
    ['sha512', 'SHA-512']
)
addWithVariants(
    mapDeriveAlgorithms,
    {
        derive: async (
            inp: ArrayBuffer,
            params: {
                iterations: number
                salt?: string
            } = {
                iterations: 800000,
            }
        ) => {
            // copy
            params = Object.assign({}, params)
            const key = await crypto.subtle.importKey(
                'raw',
                inp,
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            )
            if (!params.salt) {
                throw Error('no salt provided')
            }
            const salt = await unserializeToArrayBuffer(params.salt as any)
            return {
                data: await crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',
                        salt,
                        iterations: params.iterations,
                        hash: 'SHA-512',
                    },
                    key,
                    256 // cap at 256 for AESGCM compatibility
                ),
                params,
            }
        },
        deserialize: async (
            inp: string,
            params: {
                iterations: number
                salt?: string
            } = {
                iterations: 800000,
            }
        ) => {
            params = Object.assign({}, params)
            const splitted = inp.split(':')
            if (splitted.length >= 2) {
                const splitted2 = splitted[0].split(',')
                params.iterations = parseInt(splitted2[0])
                if (splitted2.length > 2) {
                    params.salt = splitted2[1]
                }
            }
            if (!params.salt) {
                throw Error('no salt provided')
            }
            const data = await unserializeToArrayBuffer(
                splitted[splitted.length - 1]
            )
            return { data, params }
        },
        serialize: async (inp) => {
            return `${inp.params.iterations},${
                inp.params.salt
            }:${await serializeToBase64(inp.data)}`
        },

        serializedName: 'PBKDF2-sha512',
        type: 'derive',
    },
    ['PBKDF2-sha512']
)
addWithVariants(
    mapDeriveAlgorithms,
    {
        derive: async (
            inp: ArrayBuffer,
            params: {
                iterations: number
                salt?: string
            } = {
                iterations: 800000,
            }
        ) => {
            const key = await crypto.subtle.importKey(
                'raw',
                inp,
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            )
            if (!params.salt) {
                throw Error('no salt provided')
            }
            const salt = await unserializeToArrayBuffer(params.salt as any)
            return {
                data: await crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',
                        salt,
                        iterations: params.iterations,
                        hash: 'SHA-256',
                    },
                    key,
                    256 // cap at 256 for AESGCM compatibility
                ),
                params,
            }
        },
        deserialize: async (
            inp: string,
            params: {
                iterations: number
                salt?: string
            } = {
                iterations: 800000,
            }
        ) => {
            params = Object.assign({}, params)
            const splitted = inp.split(':')
            if (splitted.length >= 2) {
                const splitted2 = splitted[0].split(',')
                params.iterations = parseInt(splitted2[0])
                if (splitted2.length > 2) {
                    params.salt = splitted2[1]
                }
            }
            const data = await unserializeToArrayBuffer(
                splitted[splitted.length - 1]
            )
            return { data, params }
        },
        serialize: async (inp) => {
            return `${inp.params.iterations},${
                inp.params.salt
            }:${await serializeToBase64(inp.data)}`
        },
        serializedName: 'PBKDF2-sha256',
        type: 'derive',
    },
    ['PBKDF2-sha256']
)

addWithVariants(
    mapEncryptionAlgorithms,
    {
        encrypt: async (key, data) => {
            return {
                data: await crypto.subtle.encrypt(
                    {
                        name: 'RSA-OAEP',
                    },
                    key,
                    data
                ),
                params: {},
            }
        },
        serializeParams: defaultSerializeParams,
        decrypt: async (key, data) => {
            return {
                data: await crypto.subtle.decrypt(
                    {
                        name: 'RSA-OAEP',
                    },
                    key,
                    data
                ),
                params: {},
            }
        },
        deserialize: defaultDeserialize,
        generateKey: async ({ bits }: { bits: number } = { bits: 4096 }) => {
            return {
                key: await crypto.subtle.generateKey(
                    {
                        name: 'RSA-OAEP',
                        modulusLength: bits,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        hash: 'SHA-512',
                    },
                    true,
                    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                ),
                params: { bits },
            }
        },
        keyParams: {
            name: 'RSA-OAEP',
            hash: 'SHA-512',
        },
        serializedName: 'rsa-sha512',
        type: 'asymmetric',
    },
    ['rsa-sha512', 'sha512', 'SHA-512']
)

addWithVariants(
    mapEncryptionAlgorithms,
    {
        encrypt: async (key, data) => {
            return {
                data: await crypto.subtle.encrypt(
                    {
                        name: 'RSA-OAEP',
                    },
                    key,
                    data
                ),
                params: {},
            }
        },
        decrypt: async (key, data) => {
            return {
                data: await crypto.subtle.decrypt(
                    {
                        name: 'RSA-OAEP',
                    },
                    key,
                    data
                ),
                params: {},
            }
        },
        serializeParams: defaultSerializeParams,
        deserialize: defaultDeserialize,
        generateKey: async ({ bits }: { bits: number } = { bits: 4096 }) => {
            return {
                key: await crypto.subtle.generateKey(
                    {
                        name: 'RSA-OAEP',
                        modulusLength: bits,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        hash: 'SHA-256',
                    },
                    true,
                    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                ),
                params: { bits },
            }
        },
        keyParams: {
            name: 'RSA-OAEP',
            hash: 'SHA-256',
        },
        serializedName: 'rsa-sha256',
        type: 'asymmetric',
    },
    ['rsa-sha256', 'sha256', 'SHA-256']
)
addWithVariants(
    mapEncryptionAlgorithms,
    {
        encrypt: async (
            key,
            data,
            params?: { nonce: string | ArrayBuffer }
        ) => {
            let nonce
            if (params?.nonce) {
                nonce = await unserializeToArrayBuffer(params.nonce)
            } else {
                nonce = crypto.getRandomValues(new Uint8Array(13))
            }
            return {
                data: await crypto.subtle.encrypt(
                    {
                        name: 'AES-GCM',
                        iv: nonce,
                    },
                    key,
                    data
                ),
                params: { nonce },
            }
        },
        decrypt: async (
            key,
            data,
            params: { nonce: string | ArrayBuffer }
        ) => {
            if (!params?.nonce) {
                throw new Error('missing nonce')
            }
            const nonce = await unserializeToArrayBuffer(params.nonce)
            return {
                data: await crypto.subtle.decrypt(
                    {
                        name: 'AES-GCM',
                        iv: nonce,
                    },
                    key,
                    data
                ),
                params: { nonce },
            }
        },
        serializeParams: async (params: { nonce: ArrayBuffer }) => {
            return `${await serializeToBase64(params.nonce)}`
        },
        deserialize: async (inp: string, params?: { nonce: ArrayBuffer }) => {
            let params2: { nonce?: ArrayBuffer } = Object.assign(
                {},
                params || {}
            )
            let splitted = splitFirstOnly(inp)
            // swap, splittedFirst will put on error the string at the second place
            if (!splitted[0] && splitted[1]) {
                splitted = [splitted[1], splitted[0]]
            }
            params2.nonce = await unserializeToArrayBuffer(splitted[0])
            let cleaned: ArrayBuffer | undefined = undefined
            if (params2.nonce && splitted[splitted.length - 1]) {
                cleaned = await unserializeToArrayBuffer(
                    splitted[splitted.length - 1]
                )
            }
            return {
                params: params2,
                data: cleaned,
            }
        },
        generateKey: async () => {
            return {
                key: crypto.getRandomValues(new Uint8Array(32)),
                params: {},
            }
        },
        keyParams: {
            name: 'AES-GCM',
        },
        serializedName: 'AESGCM',
        type: 'symmetric',
    },
    ['AESGCM']
)
addWithVariants(
    mapSignatureAlgorithms,
    {
        sign: (key, data) =>
            serializeToBase64(
                crypto.subtle.sign(
                    {
                        name: 'RSA-PSS',
                        saltLength: 64,
                    },
                    key,
                    data
                )
            ),
        verify: async (key, signature, data) =>
            await crypto.subtle.verify(
                {
                    name: 'RSA-PSS',
                    saltLength: 64,
                },
                key,
                await unserializeToArrayBuffer(signature),
                data
            ),
        generateKey: async ({ bits }: { bits: number } = { bits: 4096 }) => {
            return {
                key: await crypto.subtle.generateKey(
                    {
                        name: 'RSA-PSS',
                        modulusLength: bits,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        hash: 'SHA-512',
                    },
                    true,
                    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                ),
                params: {},
            }
        },
        keyParams: {
            name: 'RSA-PSS',
            hash: 'SHA-512',
        },
        serializedName: 'rsa-sha512',
    },
    ['rsa-sha512', 'sha512', 'SHA-512']
)

addWithVariants(
    mapSignatureAlgorithms,
    {
        sign: (key, data) =>
            serializeToBase64(
                crypto.subtle.sign(
                    {
                        name: 'RSA-PSS',
                        saltLength: 32,
                    },
                    key,
                    data
                )
            ),
        verify: async (key, signature, data) =>
            await crypto.subtle.verify(
                {
                    name: 'RSA-PSS',
                    saltLength: 32,
                },
                key,
                await unserializeToArrayBuffer(signature),
                data
            ),
        generateKey: async ({ bits }: { bits: number } = { bits: 4096 }) => {
            return {
                key: await crypto.subtle.generateKey(
                    {
                        name: 'RSA-PSS',
                        modulusLength: bits,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        hash: 'SHA-256',
                    },
                    true,
                    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                ),
                params: { bits },
            }
        },
        keyParams: {
            name: 'RSA-PSS',
            hash: 'SHA-256',
        },
        serializedName: 'rsa-sha256',
    },
    ['rsa-sha256', 'sha256', 'SHA-256']
)
