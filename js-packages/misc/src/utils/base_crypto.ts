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

export abstract class DeriveAlgorithm {
    serializedName: string
    type: 'hash' | 'derive'
    abstract derive(
        inp: ArrayBuffer,
        params?: ParamsType
    ): Promise<CryptoResult>
    async deserialize(
        inp: string,
        params?: ParamsType
    ): Promise<CryptoResult> {
        const match = inp.match(/^:*(.*?)$/) as string[]
        return {
            data: await unserializeToArrayBuffer(match[1]),
            params: params || {},
        }
    }
    async serialize(inp: {
        data: ArrayBuffer
        params: ParamsType
    }): Promise<string> {
        return await serializeToBase64(inp.data)
    }
}

export abstract class EncryptionAlgorithm {
    keyParams: any
    serializedName: string
    type: 'asymmetric' | 'symmetric'

    abstract encrypt(
        key: KeyType,
        data: ArrayBuffer,
        params: ParamsType
    ): Promise<CryptoResult>
    abstract decrypt(
        key: KeyType,
        data: ArrayBuffer,
        params: ParamsType
    ): Promise<CryptoResult>
    abstract generateKey(params: ParamsType): Promise<KeyResult>
    async serializeParams(params: ParamsType): Promise<string> {
        return ''
    }
    async deserialize(
        inp: string,
        params?: ParamsType
    ): Promise<OptionalCryptoResult> {
        const match = inp.match(/^:*(.*?)$/) as string[]
        return {
            data: await unserializeToArrayBuffer(match[1]),
            params: params || {},
        }
    }
}

export abstract class SignatureAlgorithm {
    serializedName: string
    keyParams: any
    abstract sign(key: KeyType, data: ArrayBuffer): Promise<string>
    abstract verify(
        key: KeyType,
        signature: string,
        data: ArrayBuffer
    ): Promise<boolean>
    abstract generateKey(params: ParamsType): Promise<KeyResult>
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
    [algo: string]: DeriveAlgorithm
} = {}

export const mapEncryptionAlgorithms: {
    [algo: string]: EncryptionAlgorithm
} = {}
export const mapSignatureAlgorithms: {
    [algo: string]: SignatureAlgorithm
} = {}

class HashAlgos extends DeriveAlgorithm {
    type = 'hash' as const
    operationName: string
    constructor(operationName: string) {
        super()
        this.operationName = operationName
        this.serializedName = operationName.toLowerCase().replace('-', '')
    }
    async derive(inp: ArrayBuffer) {
        return {
            data: await crypto.subtle.digest(this.operationName, inp),
            params: {},
        }
    }
}
addWithVariants(mapDeriveAlgorithms, new HashAlgos('SHA-256'), [
    'sha256',
    'SHA-256',
])

addWithVariants(mapDeriveAlgorithms, new HashAlgos('SHA-512'), [
    'sha512',
    'SHA-512',
])

class PBKDF2Algos extends DeriveAlgorithm {
    type = 'derive' as const
    operationName: string
    constructor(operationName: string) {
        super()
        this.operationName = operationName
        this.serializedName = `PBKDF2-${operationName
            .toLowerCase()
            .replace('-', '')}`
    }
    async derive(
        inp: ArrayBuffer,
        params: {
            iterations: number
            salt?: string
        } = {
            iterations: 800000,
        }
    ) {
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
    }
    async deserialize(
        inp: string,
        params: {
            iterations: number
            salt?: string
        } = {
            iterations: 800000,
        }
    ) {
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
    }
    async serialize(inp: CryptoResult) {
        return `${inp.params.iterations},${
            inp.params.salt
        }:${await serializeToBase64(inp.data)}`
    }
}
addWithVariants(mapDeriveAlgorithms, new PBKDF2Algos('SHA-512'), [
    'PBKDF2-sha512',
])
addWithVariants(mapDeriveAlgorithms, new PBKDF2Algos('SHA-256'), [
    'PBKDF2-256',
])

class RSAOEAPAlgos extends EncryptionAlgorithm {
    type = 'asymmetric' as const
    operationName: string
    declare keyParams: {
        name: 'RSA-OAEP'
        hash: string
    }
    constructor(operationName: string) {
        super()
        this.keyParams = {
            name: 'RSA-OAEP',
            hash: operationName,
        }
        this.serializedName = `rsa-${operationName
            .toLowerCase()
            .replace('-', '')}`
    }
    async encrypt(key: KeyType, data: ArrayBuffer) {
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
    }
    async decrypt(key: KeyType, data: ArrayBuffer) {
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
    }
    async generateKey({ bits }: { bits: number } = { bits: 4096 }) {
        return {
            key: await crypto.subtle.generateKey(
                {
                    modulusLength: bits,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    ...this.keyParams,
                },
                true,
                ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
            ),
            params: { bits },
        }
    }
}
addWithVariants(mapEncryptionAlgorithms, new RSAOEAPAlgos('SHA-512'), [
    'rsa-sha512',
    'sha512',
    'SHA-512',
])

addWithVariants(mapEncryptionAlgorithms, new RSAOEAPAlgos('SHA-256'), [
    'rsa-sha256',
    'sha256',
    'SHA-256',
])

class AESGCMAlgos extends EncryptionAlgorithm {
    serializedName = 'AESGCM'
    type = 'symmetric' as const
    keyParams = {
        name: 'AES-GCM',
    }
    async encrypt(
        key: KeyType,
        data: ArrayBuffer,
        params?: { nonce: string | ArrayBuffer }
    ) {
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
    }
    async decrypt(
        key: KeyType,
        data: ArrayBuffer,
        params: { nonce: string | ArrayBuffer }
    ) {
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
    }
    async serializeParams(params: { nonce: ArrayBuffer }) {
        return `${await serializeToBase64(params.nonce)}`
    }
    async deserialize(inp: string, params?: { nonce: ArrayBuffer }) {
        let params2: { nonce?: ArrayBuffer } = Object.assign({}, params || {})
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
    }
    async generateKey() {
        return {
            key: crypto.getRandomValues(new Uint8Array(32)),
            params: {},
        }
    }
}
addWithVariants(mapEncryptionAlgorithms, new AESGCMAlgos(), ['AESGCM'])

class RSAPSSAlgos extends SignatureAlgorithm {
    type = 'asymmetric' as const
    operationName: string
    saltLength: number
    declare keyParams: {
        name: 'RSA-PSS'
        hash: string
    }
    constructor(operationName: string, saltLength: number) {
        super()
        this.saltLength = saltLength
        this.keyParams = {
            name: 'RSA-PSS',
            hash: operationName,
        }
        this.serializedName = `rsa-${operationName
            .toLowerCase()
            .replace('-', '')}`
    }
    async sign(key: KeyType, data: ArrayBuffer) {
        return await serializeToBase64(
            crypto.subtle.sign(
                {
                    name: 'RSA-PSS',
                    saltLength: this.saltLength,
                },
                key,
                data
            )
        )
    }

    async verify(key: KeyType, signature: string, data: ArrayBuffer) {
        return await crypto.subtle.verify(
            {
                name: 'RSA-PSS',
                saltLength: this.saltLength,
            },
            key,
            await unserializeToArrayBuffer(signature),
            data
        )
    }
    async generateKey({ bits }: { bits: number } = { bits: 4096 }) {
        return {
            key: await crypto.subtle.generateKey(
                {
                    modulusLength: bits,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    ...this.keyParams,
                },
                true,
                ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
            ),
            params: { bits },
        }
    }
}
addWithVariants(mapSignatureAlgorithms, new RSAPSSAlgos('SHA-512', 64), [
    'rsa-sha512',
    'sha512',
    'SHA-512',
])
addWithVariants(mapSignatureAlgorithms, new RSAPSSAlgos('SHA-256', 32), [
    'rsa-sha256',
    'sha256',
    'SHA-256',
])
