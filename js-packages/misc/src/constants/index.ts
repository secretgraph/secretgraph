import { MainContextInterface } from '../interfaces'
export const validActions = new Set<MainContextInterface['action']>([
    'login',
    'register',
    'create',
    'view',
    'update',
    'help',
])
export const validNotLoggedInActions = new Set<MainContextInterface['action']>([
    'login',
    'register',
    'help',
])

export const public_states = ['required', 'trusted', 'public']

export const UseCriteria = {
    TRUE: 'TRUE' as const,
    FALSE: 'FALSE' as const,
    IGNORE: 'IGNORE' as const,
}

export const UseCriteriaPublic = {
    TRUE: 'TRUE' as const,
    FALSE: 'FALSE' as const,
    IGNORE: 'IGNORE' as const,
    TOKEN: 'TOKEN' as const,
}
export const protectedActions = new Set<'storedUpdate' | 'auth'>([
    'storedUpdate',
    'auth',
])

export const contentStates = ['draft', 'internal', 'public']
export const contentStatesKey = ['internal', 'public', 'required', 'trusted']

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
    ECDSAprivate: { usages: ['sign', 'deriveKey', 'deriveBits'] },
    ECDSApublic: { usages: ['verify', 'deriveKey', 'deriveBits'] },
    'RSA-OAEPprivate': { usages: ['decrypt'] },
    'RSA-OAEPpublic': { usages: ['encrypt'] },
    'AES-GCM': { usages: ['encrypt', 'decrypt'] },
}

export const stubCluster = Buffer.from('Cluster:-1').toString('base64')
export const stubContent = Buffer.from('stubContent:-1').toString('base64')
