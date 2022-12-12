// import { ApolloClient } from "@apollo/client";

export type NonKeyInput = string | Blob | ArrayBuffer
export type RawInput = NonKeyInput | CryptoKey
export type KeyInput = RawInput | CryptoKeyPair

export interface KeyOutInterface {
    data: ArrayBuffer
}

export interface CryptoRSAInInterface {
    readonly data: RawInput | PromiseLike<RawInput>
    readonly key: KeyInput | PromiseLike<KeyInput>
    readonly hashAlgorithm?: string | PromiseLike<string>
}

export interface CryptoRSAOutInterface extends KeyOutInterface {
    data: ArrayBuffer
    key: CryptoKey
    hashAlgorithm: string
    nonce?: ArrayBuffer
}

export interface CryptoGCMInInterface {
    readonly data: RawInput | PromiseLike<RawInput>
    readonly key: KeyInput | PromiseLike<KeyInput>
    readonly nonce?: NonKeyInput | PromiseLike<NonKeyInput>
}

export interface CryptoGCMOutInterface extends KeyOutInterface {
    key: CryptoKey
    nonce: ArrayBuffer
}

export interface PWInterface {
    readonly pw: NonKeyInput | PromiseLike<NonKeyInput>
    readonly salt: NonKeyInput | PromiseLike<NonKeyInput>
    readonly iterations: number | string | PromiseLike<number | string>
    readonly hashAlgorithm?: string | PromiseLike<string>
}

export interface ActionInterface {
    existingHash?: string
    start?: Date
    stop?: Date
    value: string
    key?: string
}

export interface ReferenceInterface {
    target: string
    group: string
    extra: string
    deleteRecursive?: 'NO_GROUP' | 'TRUE' | 'FALSE'
}

type ConfigHashValue = string[]

interface TrustedKeyValue {
    links: string[]
    note: string
    // level 3 hashes are stripped from config but allow them here
    level: 1 | 2 | 3
    lastChecked: number
}

interface ConfigTokenValue {
    data: string
    note: string
    system: boolean
}
interface ConfigCertificateValue {
    data: string
    note: string
    signWith: boolean
}

export type ConfigHashesInterface<N = never> = {
    [hash: string]: ConfigHashValue | N
}

export interface ConfigContentInterface<N = never> {
    hashes: ConfigHashesInterface<N>
    //trusted: string[]
    cluster: string | N
}

export interface ConfigClusterInterface<N = never> {
    hashes: ConfigHashesInterface<N>
    //trusted: string[]
}

interface BaseHostInterface<ClusterType, ContentType> {
    clusters: { [flexid: string]: ClusterType }
    contents: { [flexid: string]: ContentType }
}

interface BaseConfigInterface<N = never> {
    baseUrl: string
    configCluster: string
    certificates: { [hash: string]: ConfigCertificateValue | N }
    tokens: { [hash: string]: ConfigTokenValue | N }
    trustedKeys: { [hash: string]: TrustedKeyValue | N }
    slots: string[]
}

export interface ConfigInterface extends BaseConfigInterface {
    hosts: {
        [url: string]: BaseHostInterface<
            ConfigClusterInterface,
            ConfigContentInterface
        >
    }
}

export interface ConfigInputInterface
    extends Partial<BaseConfigInterface<null>> {
    hosts?: {
        [url: string]: Partial<
            BaseHostInterface<
                ConfigClusterInterface<null> | null,
                ConfigContentInterface<null> | null
            >
        > | null
    }
}

export interface SecretgraphEventInterface {
    pingCreate?: boolean
}

export interface MainContextInterface {
    action: 'login' | 'register' | 'create' | 'view' | 'update' | 'help'
    updateId: null | string
    title: string
    // Content
    item: null | string
    // Cluster
    cluster: null | string
    // activeUrl can be changed without changing active element, so cache it here
    url: null | string
    type: null | string
    shareFn: null | (() => void)
    deleted: Date | null | false
    tokens: string[]
    tokensPermissions: Set<string>
}

export interface SearchContextInterface {
    cluster: null | string
    include: string[]
    exclude: string[]
    deleted: boolean
    // environment: Environment | null;
}

export interface AuthInfoInterface {
    tokens: string[]
    hashes: string[]
    certificateHashes: string[]
    types: Set<string>
}

export interface ElementEntryInterface {
    label: string
    ignore?: boolean
    component: React.LazyExoticComponent<any>
}

export interface CryptoHashPair {
    key: CryptoKey
    hash: string
}
