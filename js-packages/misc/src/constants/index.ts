declare var gettext: any

export const protectedActions = new Set(['storedUpdate', 'auth'])

export const contentStates = ['draft', 'internal', 'public']

export const mapHashNames: {
    [algo: string]: {
        readonly operationName: string
        readonly length: number
        readonly serializedName: string
    }
} = {
    sha512: { operationName: 'SHA-512', length: 512, serializedName: 'sha512' },
    'SHA-512': {
        operationName: 'SHA-512',
        length: 512,
        serializedName: 'sha512',
    },
    sha256: { operationName: 'SHA-256', length: 256, serializedName: 'sha256' },
    'SHA-256': {
        operationName: 'SHA-256',
        length: 256,
        serializedName: 'sha256',
    },
}

export const mapEncryptionAlgorithms: {
    readonly [algo: string]: { readonly usages: KeyUsage[] }
} = {
    PBKDF2: { usages: ['deriveBits', 'deriveKey'] },
    'RSA-PSSprivate': { usages: ['sign'] },
    'RSA-PSSpublic': { usages: ['verify'] },
    'RSASSA-PKCS1-v1_5private': { usages: ['sign'] },
    'RSASSA-PKCS1-v1_5public': { usages: ['verify'] },
    ECDSAprivate: { usages: ['sign', 'deriveKey', 'deriveBits'] },
    ECDSApublic: { usages: ['verify', 'deriveKey', 'deriveBits'] },
    'RSA-OAEPprivate': { usages: ['decrypt'] },
    'RSA-OAEPpublic': { usages: ['encrypt'] },
    'AES-GCM': { usages: ['encrypt', 'decrypt'] },
}
