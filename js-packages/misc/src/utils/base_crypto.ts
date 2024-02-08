import { unserializeToArrayBuffer, serializeToBase64 } from './encoding'
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

export const validHashNames: { [key: string]: string } = {}
export const validDeriveNames: { [key: string]: string } = {}
export const validSymmetricNames: { [key: string]: string } = {}
export const validAsymmetricNames: { [key: string]: string } = {}

// argon1id, pkb
export const mapDeriveAlgorithms: {
    [algo: string]: {
        readonly derive: (
            inp: ArrayBuffer,
            params: any
        ) => Promise<{ data: ArrayBuffer; params: any }>
        readonly deserialize?: (
            inp: string,
            params?: any
        ) => Promise<{ data: ArrayBuffer; params: any }>
        readonly serialize: (inp: {
            data: ArrayBuffer
            params: any
        }) => Promise<string>
        readonly serializedName: string
    }
} = {}

export const mapEncryptionAlgorithms: {
    [algo: string]: {
        // encrypt serializes
        readonly encrypt: (
            key: any,
            data: ArrayBuffer,
            params?: any
        ) => Promise<{ data: ArrayBuffer; params: any }>
        readonly decrypt: (
            key: any,
            data: ArrayBuffer,
            params?: any
        ) => Promise<{ data: ArrayBuffer; params: any }>
        readonly serialize?: (inp: {
            data: ArrayBuffer
            params: any
        }) => Promise<string>
        readonly deserialize?: (
            inp: string
        ) => Promise<{ data: ArrayBuffer; params: any }>
        readonly serializedName: string
        readonly keyParams: any
    }
} = {}
export const mapSignatureAlgorithms: {
    [algo: string]: {
        // sign serializes
        readonly sign: (key: any, data: ArrayBuffer) => Promise<string>
        readonly verify: (
            key: any,
            signature: string,
            data: ArrayBuffer
        ) => Promise<boolean>
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
        serialize: async (inp) => {
            return await serializeToBase64(inp.data)
        },
        serializedName: 'sha256',
    },
    ['sha256', 'SHA-256']
)
addWithVariants(validHashNames, 'sha256', ['sha256', 'SHA-256'])
addWithVariants(
    mapDeriveAlgorithms,
    {
        derive: async (inp: ArrayBuffer) => {
            return {
                data: await crypto.subtle.digest('SHA-512', inp),
                params: {},
            }
        },
        serialize: async (inp) => {
            return await serializeToBase64(inp.data)
        },
        serializedName: 'sha512',
    },
    ['sha512', 'SHA-512']
)
addWithVariants(validHashNames, 'sha512', ['sha512', 'SHA-512'])
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
            if (splitted.length > 1) {
                params.iterations = parseInt(splitted[0])
            }
            if (splitted.length > 2) {
                params.salt = splitted[1]
            }
            const data = await unserializeToArrayBuffer(
                splitted[splitted.length - 1]
            )
            return { data, params }
        },
        serialize: async (inp) => {
            return `${inp.params.iterations}:${
                inp.params.salt
            }:${await serializeToBase64(inp.data)}`
        },

        serializedName: 'PBKDF2-sha512',
    },
    ['PBKDF2-sha512']
)
addWithVariants(validDeriveNames, 'PBKDF2-sha512', [
    'PBKDF2-sha512',
    'sha512',
    'SHA-512',
])
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
            if (splitted.length > 1) {
                params.iterations = parseInt(splitted[0])
            }
            if (splitted.length > 2) {
                params.salt = splitted[1]
            }
            const data = await unserializeToArrayBuffer(
                splitted[splitted.length - 1]
            )
            return { data, params }
        },
        serialize: async (inp) => {
            return `${inp.params.iterations}:${
                inp.params.salt
            }:${await serializeToBase64(inp.data)}`
        },
        serializedName: 'PBKDF2-sha256',
    },
    ['PBKDF2-sha256']
)
addWithVariants(validDeriveNames, 'PBKDF2-sha256', [
    'PBKDF2-sha256',
    'sha256',
    'SHA-256',
])

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
        serializedName: 'rsa-sha512',
        keyParams: {
            name: 'RSA-OAEP',
            hash: 'SHA-512',
        },
    },
    ['rsa-sha512', 'sha512', 'SHA-512']
)
addWithVariants(validAsymmetricNames, 'rsa-sha512', [
    'rsa-sha512',
    'sha512',
    'SHA-512',
])

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
        serializedName: 'rsa-sha256',
        keyParams: {
            name: 'RSA-OAEP',
            hash: 'SHA-256',
        },
    },
    ['rsa-sha256', 'sha256', 'SHA-256']
)
addWithVariants(validAsymmetricNames, 'rsa-sha256', [
    'rsa-sha256',
    'sha256',
    'SHA-256',
])

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
        serializedName: 'AESGCM',
        keyParams: {
            name: 'AES-GCM',
        },
    },
    ['AESGCM']
)
addWithVariants(validSymmetricNames, 'AESGCM', ['AESGCM'])
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
        serializedName: 'rsa-sha512',
        keyParams: {
            name: 'RSA-PSS',
            hash: 'SHA-512',
        },
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
        serializedName: 'rsa-sha256',
        keyParams: {
            name: 'RSA-PSS',
            hash: 'SHA-256',
        },
    },
    ['rsa-sha256', 'sha256', 'SHA-256']
)
