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
    start?: string
    stop?: string
    value: string
    key: string
}

export interface ReferenceInterface {
    target: string
    group: string
    extra: string
}

export interface ConfigContentInterface {
    hashes: { [hash: string]: string[] }
    id: string
}

export interface ConfigClusterInterface {
    hashes: { [hash: string]: string[] }
}

interface BaseHostInterface<ClusterType, ContentType> {
    hashAlgorithms: string[]
    clusters: { [flexid: string]: ClusterType }
    contents: { [flexid: string]: ContentType }
}

interface BaseConfigInterface<SType = string> {
    baseUrl: string
    configHashes: string[]
    configCluster: string
    certificates: { [hash: string]: SType }
    tokens: { [hash: string]: SType }
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
    extends Partial<BaseConfigInterface<string | null>> {
    hosts?: {
        [url: string]: Partial<
            BaseHostInterface<
                ConfigClusterInterface | null,
                ConfigContentInterface | null
            >
        > | null
    }
}

export interface SecretgraphEventInterface {
    pingCreate?: boolean
}

export interface SnackMessageInterface {
    severity: string
    message: string
}

export interface MainContextInterface {
    action: string
    title: null | string
    state: 'start' | 'add' | 'view' | 'edit' | 'help'
    item: null | string
    // activeUrl can be changed without changing active element, so cache it here
    url: null | string
    type: null | string
    shareUrl: null | string
}

export interface SearchContextInterface {
    cluster: null | string
    include: string[]
    exclude: string[]
    // environment: Environment | null;
}

export interface AuthInfoInterface {
    keys: string[]
    hashes: string[]
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
