export type RawInput = string | Blob | ArrayBuffer | DataView

export interface KeyOutInterface {
    data: ArrayBuffer
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

type ConfigHashValue<N = string> = N[]

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
    algorithm: string
    note: string
}

export type ConfigHashesInterface<N = never, T = string> = {
    [hash: string]: ConfigHashValue<T> | N
}

export interface ConfigContentInterface<N = never, T = string> {
    hashes: ConfigHashesInterface<N>
    // empty string for unknown cluster
    cluster: string
}

export interface ConfigClusterInterface<N = never, T = string> {
    hashes: ConfigHashesInterface<N>
}

interface BaseHostInterface<ClusterType, ContentType> {
    clusters: { [flexid: string]: ClusterType }
    contents: { [flexid: string]: ContentType }
    // primary Token cluster ids
    primary: { [slot: string]: string[] }
}

interface BaseConfigInterface<N = never> {
    baseUrl: string
    configCluster: string
    certificates: { [hash: string]: ConfigCertificateValue | N }
    tokens: { [hash: string]: ConfigTokenValue | N }
    slots: string[]
    configLockUrl: string
    configSecurityQuestion: [string, string]
    signWith: { [slot: string]: string[] }
}

export interface ConfigInterface extends BaseConfigInterface {
    hosts: {
        [url: string]: BaseHostInterface<
            ConfigClusterInterface,
            ConfigContentInterface
        >
    }
    trustedKeys: { [hash: string]: TrustedKeyValue }
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
    trustedKeys?: { [hash: string]: Partial<TrustedKeyValue> | null }
}

export interface SecretgraphEventInterface {
    pingCreate?: boolean
}

// undefined means here: don't touch
export interface MainContextInterface {
    action:
        | 'clone'
        | 'login'
        | 'register'
        | 'create'
        | 'view'
        | 'update'
        | 'help'
    securityLevel: 1 | 2 | 2 | 4 | null
    // a warning is shown above the content if level 3, 4
    // in level 3 it requests for an update of trusted keys
    // in level 4 it is a modal and must be accepted to continue
    // should be initial active
    securityWarningArmed: boolean
    // is content editable, must be initially set to true
    // optional for create (item=null), maybe becomes mandatory
    readonly: boolean
    updateId: null | string
    title: string
    // Content
    item: null | string
    // Cluster used for determining current cluster of item, saved in hash
    currentCluster: null | string
    // Cluster used for updates
    editCluster: null | string
    // activeUrl can be changed without changing active element, so cache it here
    url: null | string
    type: null | string
    shareFn: null | (() => void)
    deleted: Date | null | false
    openDialog: null | string
    tokens: string[]
    tokensPermissions: Set<string>
    cloneData: null | { [key: string]: any }
}

export interface SearchContextInterface {
    cluster: null | string
    include: string[]
    exclude: string[]
    deleted: boolean | undefined
    // environment: Environment | null;
}

export interface AuthInfoInterface {
    tokens: string[]
    tokenHashes: string[]
    certificateHashes: string[]
    types: Set<string>
    limitReached: boolean
}

export interface ElementEntryInterface {
    label: string
    ignore?: boolean
    component: React.LazyExoticComponent<any>
}

export interface CryptoHashPair {
    key: ArrayBuffer
    hash: string
}
