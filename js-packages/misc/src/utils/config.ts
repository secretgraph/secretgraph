import { saveAs } from 'file-saver'

import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import { b64toarr, serializeToBase64, utf8encoder } from './encoding'
import {
    decryptAESGCM,
    decryptFirstPreKey,
    decryptPreKeys,
    decryptRSAOEAP,
    encryptAESGCM,
    encryptPreKey,
    unserializeToCryptoKey,
} from './encryption'
import { hashObject } from './hashing'
import {
    InvalidMergeError,
    compareArray,
    fallback_fetch,
    mergeDeleteObjects,
    mergeDeleteObjectsReplace,
    multiAssign,
} from './misc'
import * as SetOps from './set'

export function moveHosts({
    config,
    update,
}: {
    config: Interfaces.ConfigInterface
    update: { [oldHost: string]: string }
}): Interfaces.ConfigInputInterface {
    const domains: { [key: string]: string } = {}
    for (const [key, value] of Object.entries(update)) {
        domains[new URL(key).host] = new URL(value).host
    }
    const hosts: Interfaces.ConfigInterface['hosts'] = {}
    for (const [key, value] of Object.entries(config.hosts)) {
        if (update[key]) {
            hosts[update[key]] = value
        }
    }
    const trustedKeys: Interfaces.ConfigInterface['trustedKeys'] = {}
    for (const [key, value] of Object.entries(config.trustedKeys)) {
        let hasUpdate = false
        let links: string[] = []
        for (const link of value.links) {
            const linkUrl = new URL(link)
            linkUrl.host = domains[linkUrl.host] ?? linkUrl.host
            const nlink = linkUrl.href
            // deduplicate
            if (link != nlink || links.includes(nlink)) {
                hasUpdate = true
            }
            links.push(nlink)
        }
        if (hasUpdate) {
            trustedKeys[key] = {
                ...value,
                links,
            }
        }
    }
    return {
        ...config,
        hosts,
        trustedKeys,
    }
}
// 42
const defaultAnswer =
    '100000:sha256:ZXJ3ODl1ZWFzOWZ1YfdN+sw3wksxdTRbr4qHZXuvt3rAPxpVye+9jnfJ+xjL'

export function cleanConfig(
    config: Interfaces.ConfigInterface | null | undefined,
    domain?: string
): [Interfaces.ConfigInterface | null, boolean] {
    let hasChanges = false
    if (!config) {
        return [null, false]
    }
    if (
        !config.baseUrl ||
        !(config.hosts instanceof Object) ||
        !(config.tokens instanceof Object) ||
        !(config.certificates instanceof Object) ||
        !config.configCluster
    ) {
        console.error('Errors in config', config)
        return [null, false]
    }
    if (!config.slots?.length) {
        config.slots = ['main']
        hasChanges = true
    }
    if (!config.configLockUrl) {
        config.configLockUrl = ''
        hasChanges = true
    }

    if (!config.configSecurityQuestion?.length) {
        config.configSecurityQuestion = [
            'The answer to life, the universe, and everything ("The Hitchhiker\'s Guide to the Galaxy").',
            defaultAnswer,
        ]
        hasChanges = true
    }
    if (!Object.keys(config.trustedKeys || {}).length) {
        config.trustedKeys = {}
        hasChanges = true
    }
    for (const [key, val] of Object.entries(config.tokens)) {
        if (typeof val == 'string') {
            config.tokens[key] = {
                data: val,
                note: '',
                system: false,
            }
            hasChanges = true
        }
    }
    for (const [key, val] of Object.entries(config.certificates)) {
        if (typeof val == 'string') {
            config.certificates[key] = {
                data: val,
                note: '',
            }
            hasChanges = true
        }
    }
    for (const host of Object.values(config.hosts)) {
        if (!host['clusters']) {
            host['clusters'] = {}
        }
        if (!host['contents']) {
            host['contents'] = {}
        }
    }
    if (domain) {
        const nBaseurl = new URL(config.baseUrl, domain).href
        if (nBaseurl != config.baseUrl) {
            hasChanges = true
            config.baseUrl = nBaseurl
        }
        for (const host of [...Object.keys(config.hosts)]) {
            const nhost = new URL(host, domain).href
            if (host != nhost) {
                if (!config.hosts[nhost]) {
                    config.hosts[nhost] = {
                        clusters: {},
                        contents: {},
                    }
                }

                const new_clusters = mergeDeleteObjects(
                    config.hosts[nhost].clusters,
                    config.hosts[host].clusters,
                    (
                        oldval: Interfaces.ConfigClusterInterface,
                        newval: Interfaces.ConfigClusterInterface<null>
                    ) => {
                        const newState: Interfaces.ConfigClusterInterface =
                            oldval
                                ? oldval
                                : {
                                      hashes: {},
                                  }
                        if (newval.hashes) {
                            const res = mergeDeleteObjects(
                                newState.hashes,
                                newval.hashes,
                                (old, newobj) => {
                                    if (!old) {
                                        return [[...new Set(newobj)], 1]
                                    }
                                    return [
                                        [...new Set([...old, ...newobj])],
                                        1,
                                    ]
                                }
                            )
                            newState.hashes = res[0]
                        }
                        return [newState, 1]
                    }
                )[0]
                config.hosts[nhost].clusters = new_clusters
                const new_contents = mergeDeleteObjects(
                    config.hosts[nhost].contents,
                    config.hosts[host].contents,
                    (
                        oldval: Interfaces.ConfigContentInterface,
                        newval: Interfaces.ConfigContentInterface<null>
                    ) => {
                        const newState: Interfaces.ConfigContentInterface =
                            oldval
                                ? oldval
                                : {
                                      hashes: {},
                                      cluster: '',
                                  }
                        if (newval.hashes) {
                            newState.hashes = mergeDeleteObjects(
                                newState.hashes,
                                newval.hashes,
                                (old, newobj) => {
                                    if (!old) {
                                        return [[...new Set(newobj)], 1]
                                    }
                                    return [
                                        [...new Set([...old, ...newobj])],
                                        1,
                                    ]
                                }
                            )[0]
                        }
                        if (newval.cluster) {
                            newState.cluster = newval.cluster
                        }
                        if (!newState.cluster) {
                            throw Error('cluster is missing')
                        }
                        return [newState, 1]
                    }
                )[0]
                config.hosts[nhost].contents = new_contents
                delete config.hosts[host]
                hasChanges = true
            }
        }

        for (const value of Object.values(config.trustedKeys)) {
            let hasUpdate = false
            let links: string[] = []
            for (const link of value.links) {
                const nlink = new URL(link, domain).href
                // deduplicate
                if (link != nlink || links.includes(nlink)) {
                    hasChanges = true
                    hasUpdate = true
                }
                links.push(nlink)
            }
            if (hasUpdate) {
                value.links = links
            }
        }
    }
    return [config, hasChanges]
}

export function authInfoFromConfig({
    config,
    url,
    require = new Set(['view', 'update', 'manage']),
    excludeClusters = new Set(),
    limit,
    ...props
}: {
    readonly config: Interfaces.ConfigInterface
    readonly url: string
    readonly clusters?: Set<string>
    readonly excludeClusters?: Set<string>
    readonly contents?: Set<string>
    readonly require?: Set<string>
    readonly search?: string
    readonly limit?: number
}): Interfaces.AuthInfoInterface {
    const tokens = new Set<string>()
    const hashes = new Set<string>()
    const types = new Set<string>()
    let limitReached = false
    const limitWarning = limit === undefined ? false : true
    limit = limit !== undefined ? limit : 100
    const certificateHashes = new Set<string>()
    // TODO: remove other tokens if manage was found for exactly this content or cluster
    if (url === undefined || url === null) {
        throw Error(`no url: ${url}`)
    }
    const host = config.hosts[new URL(url, window.location.href).href]
    if (host) {
        // first are contents
        if (props.contents) {
            for (const content of props.contents) {
                const contentconf = host.contents[content]
                if (contentconf) {
                    for (const hash in contentconf.hashes) {
                        const perms = contentconf.hashes[hash]
                        if (config.certificates[hash]) {
                            certificateHashes.add(hash)
                        } else if (
                            config.tokens[hash] &&
                            SetOps.hasIntersection(require, perms)
                        ) {
                            if (limit && tokens.size > limit) {
                                limitReached = true
                                continue
                            }
                            hashes.add(hash)
                            if (!config.tokens[hash] || !hash) {
                                console.warn('token not found for:', hash)
                            } else if (
                                !props.search ||
                                (config.tokens[hash].system &&
                                    props.search === config.tokens[hash].note)
                            ) {
                                tokens.add(
                                    `${contentconf.cluster}:${config.tokens[hash]?.data}`
                                )
                                for (const permission of perms) {
                                    types.add(permission)
                                }
                            }
                        }
                    }
                }
            }
        }
        if (!props.contents || props.clusters || excludeClusters) {
            //  either the specified clusters or all found in host in case
            // no contents and clusters are specified
            const clusters = props.clusters
                ? props.clusters
                : Object.keys(host.clusters)
            for (const id of clusters) {
                if (id in excludeClusters) {
                    continue
                }
                const clusterconf = host.clusters[id]
                if (clusterconf) {
                    for (const hash in clusterconf.hashes) {
                        const perms = clusterconf.hashes[hash]
                        if (
                            config.tokens[hash] &&
                            SetOps.hasIntersection(require, perms)
                        ) {
                            if (limit && tokens.size > limit) {
                                limitReached = true
                                continue
                            }
                            hashes.add(hash)
                            tokens.add(`${id}:${config.tokens[hash]?.data}`)

                            for (const permission of perms) {
                                types.add(permission)
                            }
                        }
                        if (config.certificates[hash]) {
                            certificateHashes.add(hash)
                        }
                    }
                }
            }
        }
    }

    if (limitReached && limitWarning) {
        console.warn('Warning: tokens are capped as limit of 100 is reached')
    }

    // sorted is better for caching
    return {
        certificateHashes: [...certificateHashes].sort(),
        hashes: [...hashes].sort(),
        tokens: [...tokens].sort(),
        // only informative
        types,
        limitReached,
    }
}

export function extractPrivKeys({
    config,
    url,
    ...props
}: {
    readonly config: Interfaces.ConfigInterface
    readonly url: string
    readonly clusters?: Set<string>
    readonly onlySignKeys?: boolean
    readonly hashAlgorithm: string
    source?: { [hash: string]: Promise<CryptoKey> }
}): { [hash: string]: Promise<CryptoKey> } {
    const privkeys = Object.assign({}, props.source || {})
    const urlob = new URL(url, window.location.href)
    const clusters = config.hosts[urlob.href].clusters
    const signWithHashes = new Set(
        (props.onlySignKeys ? config.signWith[config.slots[0]] : []) || []
    )

    const mapItem = Constants.mapHashNames['' + props.hashAlgorithm]
    if (!mapItem) {
        throw new Error(
            'Invalid hash algorithm/no hash algorithm specified: ' +
                props.hashAlgorithm
        )
    }
    for (const id in clusters) {
        if (props.clusters && !props.clusters.has(id)) {
            continue
        }
        const clusterconf = clusters[id]
        for (const hash in clusterconf.hashes) {
            const certEntry = config.certificates[hash]
            if (
                certEntry &&
                !privkeys[hash] &&
                (!props.onlySignKeys || signWithHashes.has(hash))
            ) {
                privkeys[hash] = unserializeToCryptoKey(
                    certEntry.data,
                    {
                        name: 'RSA-OAEP',
                        hash: mapItem.operationName,
                    },
                    'privateKey'
                )
            }
        }
    }
    return privkeys
}

// also handles key= tags
export function findCertCandidatesForRefs(
    config: Interfaces.ConfigInterface,
    nodeData: any
) {
    const found: {
        hash: string
        hashAlgorithm?: string
        sharedKey: Uint8Array
    }[] = []
    // extract tag key from private key
    if (nodeData.type == 'PrivateKey') {
        const hashes = []
        for (const tag_value of nodeData.tags) {
            if (tag_value.startsWith('key_hash=')) {
                const [_, hashAlgorithm, cleanhash] = tag_value.match(
                    /=(?:([^:]*?):)?([^:]*)/
                )
                if (cleanhash) {
                    if (
                        hashAlgorithm &&
                        config.certificates[`${hashAlgorithm}:${cleanhash}`]
                    ) {
                        hashes.push({
                            hash: `${hashAlgorithm}:${cleanhash}`,
                            hashAlgorithm,
                        })
                    } else if (config.certificates[cleanhash]) {
                        hashes.push({
                            hash: cleanhash,
                            hashAlgorithm: undefined,
                        })
                    }
                }
            }
        }
        // find the only key tag
        for (const tag_value of nodeData.tags) {
            if (tag_value.startsWith('key=')) {
                for (const { hash, hashAlgorithm } of hashes) {
                    const [_, hashAlgorithmKey, shared] = tag_value.match(
                        /=(?:([^:]*?):)?([^:]*)/
                    )
                    found.push({
                        hash,
                        hashAlgorithm: hashAlgorithmKey || hashAlgorithm,
                        sharedKey: b64toarr(shared),
                    })
                }
                // there is only one key
                break
            }
        }
    }
    // extract tags with hashes
    for (const { node: refnode } of nodeData.references.edges) {
        for (const tag_value of refnode.target.tags) {
            const [_, hashAlgorithm, cleanhash] = tag_value.match(
                /^[^=]+=(?:([^:]*?):)?([^:]*)/
            )
            if (cleanhash) {
                if (config.certificates[`${hashAlgorithm}:${cleanhash}`]) {
                    const [_, hashAlgorithm2, b64] = refnode.extra.match(
                        /^(?:([^:]*?):)?([^:]*)/
                    )
                    found.push({
                        hash: `${hashAlgorithm}:${cleanhash}`,
                        hashAlgorithm: hashAlgorithm2 || hashAlgorithm,
                        sharedKey: b64toarr(b64),
                    })
                } else if (config.certificates[cleanhash]) {
                    const [_, hashAlgorithm2, b64] = refnode.extra.match(
                        /^(?:([^:]*?):)?([^:]*)/
                    )
                    found.push({
                        hash: cleanhash,
                        hashAlgorithm: hashAlgorithm2 || hashAlgorithm,
                        sharedKey: b64toarr(b64),
                    })
                }
            }
        }
    }
    return found
}

export function isUpdateEmpty(update: Interfaces.ConfigInputInterface) {
    for (const key of Object.keys(
        update
    ) as (keyof Interfaces.ConfigInterface)[]) {
        const val = update[key]
        switch (key) {
            case 'certificates':
            case 'tokens':
                if (
                    Object.values(
                        val as Required<Interfaces.ConfigInputInterface>[
                            | 'certificates'
                            | 'tokens']
                    ).some((val) => val !== undefined)
                ) {
                    return false
                }
                break
            case 'trustedKeys':
                for (const tkey of Object.values(
                    val as Required<Interfaces.ConfigInputInterface>['trustedKeys']
                )) {
                    if (tkey === undefined) {
                        continue
                    }
                    if (tkey === null) {
                        return false
                    }

                    if (Object.values(tkey).some((val) => val !== undefined)) {
                        return false
                    }
                }
                break
            case 'hosts':
                for (const host of Object.values(
                    val as Required<Interfaces.ConfigInputInterface>['hosts']
                )) {
                    if (host === undefined) {
                        continue
                    }
                    if (host === null) {
                        return false
                    }
                    for (const cluster of Object.values(host.clusters || [])) {
                        if (cluster === undefined) {
                            continue
                        }
                        if (cluster === null) {
                            return false
                        }
                        if (
                            Object.values(cluster.hashes).some(
                                (val) => val !== undefined
                            )
                        ) {
                            return false
                        }
                    }
                    for (const content of Object.values(host.contents || [])) {
                        if (content === undefined) {
                            continue
                        }
                        if (content === null) {
                            return false
                        }
                        if (content.cluster) {
                            return false
                        }
                        if (
                            Object.values(content.hashes).some(
                                (val) => val !== undefined
                            )
                        ) {
                            return false
                        }
                    }
                }
                break
            case 'slots':
                if (val && val.length) {
                    return false
                }
                break
            case 'configSecurityQuestion':
                if (val && val.length == 2) {
                    return false
                }
                break

            default:
                if (val) {
                    return false
                }
                break
        }
    }
    return true
}

export function mergeUpdates(
    ...updates: Interfaces.ConfigInputInterface[]
): Interfaces.ConfigInputInterface {
    const merged: Interfaces.ConfigInputInterface = {}
    for (const update of updates) {
        for (const key of Object.keys(
            update
        ) as (keyof Interfaces.ConfigInterface)[]) {
            const val = update[key]
            switch (key) {
                case 'signWith':
                    merged[key] = mergeDeleteObjects(
                        merged[key],
                        val,
                        mergeDeleteObjectsReplace
                    )[0]
                    break
                case 'tokens':
                    merged[key] = mergeDeleteObjects(merged[key], val)[0]
                    break
                case 'certificates':
                    merged[key] = mergeDeleteObjects(merged[key], val)[0]
                    break
                case 'trustedKeys':
                    merged[key] = mergeDeleteObjects(
                        merged[key],
                        val,
                        mergeDeleteObjectsReplace
                    )[0]
                    break
                case 'hosts':
                    merged[key] = mergeDeleteObjects(
                        merged[key],
                        update[key],
                        (
                            mergedval: Interfaces.ConfigInterface['hosts'][string],
                            newval: NonNullable<
                                NonNullable<
                                    Interfaces.ConfigInputInterface['hosts']
                                >[string]
                            >
                        ) => {
                            if (newval.clusters) {
                                mergedval.clusters = mergeDeleteObjects(
                                    mergedval.clusters,
                                    newval.clusters,
                                    (
                                        mergedval: Interfaces.ConfigClusterInterface,
                                        update: Interfaces.ConfigClusterInterface<undefined>
                                    ) => {
                                        if (update.hashes) {
                                            mergedval.hashes =
                                                mergeDeleteObjects(
                                                    mergedval.hashes,
                                                    update.hashes,
                                                    (old, newobj) => {
                                                        return [
                                                            [
                                                                ...new Set([
                                                                    ...old,
                                                                    ...newobj,
                                                                ]),
                                                            ],
                                                            1,
                                                        ]
                                                    }
                                                )[0]
                                        }
                                        return [mergedval, 1]
                                    }
                                )[0]
                            }
                            if (newval.contents) {
                                mergedval.contents = mergeDeleteObjects(
                                    mergedval.contents,
                                    newval.contents,
                                    (
                                        mergedval: Interfaces.ConfigContentInterface,
                                        update: Interfaces.ConfigContentInterface<undefined>
                                    ) => {
                                        if (update.hashes) {
                                            mergedval.hashes =
                                                mergeDeleteObjects(
                                                    mergedval.hashes,
                                                    update.hashes,
                                                    (old, newobj) => {
                                                        return [
                                                            [
                                                                ...new Set([
                                                                    ...old,
                                                                    ...newobj,
                                                                ]),
                                                            ],
                                                            1,
                                                        ]
                                                    }
                                                )[0]
                                        }
                                        if (update.cluster) {
                                            mergedval.cluster = update.cluster
                                        }
                                        return [mergedval, 1]
                                    }
                                )[0]
                            }
                            return [mergedval, 1]
                        }
                    )[0]
                    break
                case 'slots':
                    if (val && val.length) {
                        merged[key] = val as string[]
                    }
                    break
                case 'configSecurityQuestion':
                    if (val && val.length == 2) {
                        merged[key] = val as [string, string]
                    }
                    break

                default:
                    if (val && (!merged[key] || merged[key] != val)) {
                        merged[key] =
                            val as Interfaces.ConfigInputInterface[typeof key]
                    }
                    break
            }
        }
    }

    return merged
}

export function updateConfig(
    old: Interfaces.ConfigInterface | null,
    update: Interfaces.ConfigInputInterface
): [Interfaces.ConfigInterface, number] {
    let count = 0
    const newState: Interfaces.ConfigInterface = old
        ? Object.assign({}, old)
        : ({} as any)
    for (const key of Object.keys(
        update
    ) as (keyof Interfaces.ConfigInterface)[]) {
        let res
        const val = update[key]
        switch (key) {
            case 'signWith':
                res = mergeDeleteObjects(
                    newState[key],
                    val,
                    (
                        oldval: Interfaces.ConfigInterface['signWith'][string],
                        update: NonNullable<
                            NonNullable<
                                Interfaces.ConfigInputInterface['signWith']
                            >[string]
                        >
                    ) => {
                        if (!(update instanceof Array)) {
                            throw new InvalidMergeError(
                                'signWith value not an array'
                            )
                        }
                        const newUpdate = [...new Set(update)]
                        newUpdate.sort()
                        if (!oldval || !compareArray(oldval, newUpdate)) {
                            return [newUpdate, 1]
                        } else {
                            return [oldval, 0]
                        }
                    }
                )
                newState[key] = res[0]
                count += res[1]
                break
            case 'tokens':
                res = mergeDeleteObjects(newState[key], val, (old, update) => {
                    if (update.note === undefined) {
                        update.note = ''
                    }
                    if (update.system === undefined) {
                        update.system = false
                    }
                    if (!update.data) {
                        throw new InvalidMergeError('tokens entry invalid')
                    }
                    return [update, 1]
                })
                newState[key] = res[0]
                count += res[1]
                break
            case 'certificates':
                res = mergeDeleteObjects(
                    newState[key],
                    val,
                    // replace if not undefined, we do this atomic
                    (old, update) => {
                        if (update.note === undefined) {
                            update.note = ''
                        }
                        if (!update.data) {
                            throw new InvalidMergeError(
                                'certificates entry invalid'
                            )
                        }
                        return [update, 1]
                    }
                )
                newState[key] = res[0]
                count += res[1]
                break
            case 'trustedKeys':
                res = mergeDeleteObjects(
                    newState[key],
                    val,
                    (
                        oldval: Interfaces.ConfigInterface['trustedKeys'][string],
                        update: NonNullable<
                            NonNullable<
                                Interfaces.ConfigInputInterface['trustedKeys']
                            >[string]
                        >
                    ) => {
                        const [newState, count] = mergeDeleteObjectsReplace(
                            oldval,
                            update
                        )
                        if (
                            newState.note === undefined ||
                            newState.links === undefined ||
                            newState.level === undefined ||
                            newState.lastChecked === undefined
                        ) {
                            throw new InvalidMergeError(
                                'trustedKeys value incomplete: ' + newState
                            )
                        }
                        return [newState, count]
                    }
                )
                newState[key] = res[0]
                count += res[1]
                break
            case 'hosts':
                res = mergeDeleteObjects(
                    newState.hosts,
                    update.hosts,
                    (
                        oldval: Interfaces.ConfigInterface['hosts'][string],
                        newval: NonNullable<
                            NonNullable<
                                Interfaces.ConfigInputInterface['hosts']
                            >[string]
                        >
                    ) => {
                        let count = 0
                        const newState: Interfaces.ConfigInterface['hosts'][string] =
                            oldval
                                ? Object.assign({}, oldval)
                                : {
                                      clusters: {},
                                      contents: {},
                                  }
                        if (newval.clusters) {
                            const res = mergeDeleteObjects(
                                newState.clusters,
                                newval.clusters,
                                (
                                    oldval: Interfaces.ConfigClusterInterface,
                                    update: Interfaces.ConfigClusterInterface<undefined>
                                ) => {
                                    count = 0
                                    const newState: Interfaces.ConfigClusterInterface =
                                        oldval
                                            ? Object.assign({}, oldval)
                                            : {
                                                  hashes: {},
                                              }

                                    if (update.hashes) {
                                        const res = mergeDeleteObjects(
                                            newState.hashes,
                                            update.hashes,
                                            // replace if not undefined, we have arrays
                                            (old, newobj) => {
                                                if (
                                                    !(newobj instanceof Array)
                                                ) {
                                                    throw new InvalidMergeError(
                                                        'hashes not an array'
                                                    )
                                                }
                                                newobj.sort()
                                                if (
                                                    old &&
                                                    compareArray(old, newobj)
                                                ) {
                                                    return undefined
                                                }
                                                return [newobj, 1]
                                            }
                                        )
                                        newState.hashes = res[0]
                                        count += res[1]
                                    }
                                    return [newState, count]
                                }
                            )
                            newState.clusters = res[0]
                            count += res[1]
                        }
                        if (newval.contents) {
                            const res = mergeDeleteObjects(
                                newState.contents,
                                newval.contents,
                                (
                                    oldval: Interfaces.ConfigContentInterface,
                                    update: Interfaces.ConfigContentInterface<undefined>
                                ) => {
                                    let count = 0
                                    const newState: Interfaces.ConfigContentInterface =
                                        oldval
                                            ? Object.assign({}, oldval)
                                            : {
                                                  hashes: {},
                                                  cluster: '',
                                              }
                                    if (update.hashes) {
                                        const res = mergeDeleteObjects(
                                            newState.hashes,
                                            update.hashes,
                                            // replace if not undefined, we have arrays
                                            (old, newobj) => {
                                                if (
                                                    !(newobj instanceof Array)
                                                ) {
                                                    throw new InvalidMergeError(
                                                        'hashes not an array'
                                                    )
                                                }
                                                newobj.sort()
                                                if (
                                                    old &&
                                                    compareArray(old, newobj)
                                                ) {
                                                    return undefined
                                                }
                                                return [newobj, 1]
                                            }
                                        )
                                        newState.hashes = res[0]
                                        count += res[1]
                                    }
                                    if (update.cluster) {
                                        newState.cluster = update.cluster
                                    }
                                    if (!newState.cluster) {
                                        throw Error('cluster is missing')
                                    }
                                    return [newState, count]
                                }
                            )
                            newState.contents = res[0]
                            count += res[1]
                        }
                        return [newState, count]
                    }
                )
                newState[key] = res[0]
                count += res[1]
                break
            case 'slots':
                if (
                    val &&
                    val.length &&
                    (!newState[key] ||
                        !compareArray(val as string[], newState[key]))
                ) {
                    newState[key] = val as string[]
                    count++
                }
                break
            case 'configSecurityQuestion':
                if (
                    val &&
                    val.length == 2 &&
                    (!newState[key] ||
                        !compareArray(val as [string, string], newState[key]))
                ) {
                    newState[key] = val as [string, string]
                    count++
                }
                break
            default:
                if (val && (!newState[key] || newState[key] != val)) {
                    newState[key] =
                        val as Interfaces.ConfigInterface[typeof key]
                    count++
                }
                break
        }
    }
    const ret = cleanConfig(newState)
    if (!ret[0]) {
        throw Error('invalid merge')
    }
    return [ret[0], ret[1] ? count + 1 : count]
}

export function updateConfigReducer(
    state: Interfaces.ConfigInterface | null,
    inp: { update: Interfaces.ConfigInputInterface | null; replace?: boolean }
): Interfaces.ConfigInterface
export function updateConfigReducer(
    state: Interfaces.ConfigInterface | null,
    inp: { update: Interfaces.ConfigInputInterface | null; replace?: boolean }
): Interfaces.ConfigInterface | null
export function updateConfigReducer(
    state: Interfaces.ConfigInterface | null,
    {
        update,
        replace,
    }: { update: Interfaces.ConfigInputInterface | null; replace?: boolean }
): Interfaces.ConfigInterface | null {
    if (update === null) {
        return null
    }
    if (replace) {
        return update as Interfaces.ConfigInterface
    }
    return updateConfig(state, update)[0]
}

export function saveConfig(
    config: Interfaces.ConfigInterface | string,
    storage: Storage = window.localStorage
) {
    if (typeof config !== 'string') {
        config = JSON.stringify(config)
    }
    storage.setItem('secretgraphConfig', config)
}

async function loadConfigUrl_helper(
    url: string,
    content: Blob,
    contentNonce: string,
    tokens: string[],
    keys: (ArrayBuffer | string)[],
    obj: {
        keys: { [hash: string]: { link: string; key: string } }
        signatures: { [hash: string]: { link: string; signature: string } }
    }
) {
    if (!Object.keys(keys).length) {
        throw new Error('No shared keys found')
    }
    const sharedkeys: ArrayBuffer[] = []
    for (const [hash, { link, key: esharedkey }] of Object.entries(obj.keys)) {
        if (!link) {
            console.debug('Skip: ', esharedkey)
            continue
        }
        const fn = async () => {
            const response = await fallback_fetch(new URL(link, url), {
                headers: { Authorization: tokens.join(',') },
            })
            const nonce = response.headers.get('X-NONCE')
            if (!nonce) {
                throw Error('Missing nonce')
            }
            const blob = await response.blob()
            return await Promise.any(
                keys.map(async (key) => {
                    // decrypt private key
                    const privkey = (
                        await decryptAESGCM({
                            data: blob,
                            key: key,
                            nonce,
                        })
                    ).data
                    // with the private key decrypt shared key
                    return (
                        await decryptRSAOEAP({
                            key: privkey,
                            data: esharedkey,
                        })
                    ).data
                })
            )
        }
        try {
            sharedkeys.push(await fn())
        } catch (ex) {}
    }
    if (!sharedkeys.length) {
        throw new Error('No shared keys could be decrypted')
    }
    return await Promise.any(
        sharedkeys.map(async (sharedkey: ArrayBuffer) => {
            return (
                await decryptAESGCM({
                    data: content,
                    key: sharedkey,
                    nonce: contentNonce,
                })
            ).data
        })
    )
}

export function loadConfigSync(
    obj: Storage = window.localStorage
): [Interfaces.ConfigInterface | null, boolean] {
    let result = obj.getItem('secretgraphConfig')
    if (!result) {
        return [null, false]
    }
    return cleanConfig(JSON.parse(result), window.location.href)
}

export const loadConfig = async (
    obj: string | File | Storage,
    pws?: string[]
): Promise<[Interfaces.ConfigInterface | null, boolean]> => {
    if (obj instanceof Storage) {
        return loadConfigSync(obj)
    } else if (obj instanceof File) {
        let parsedResult = JSON.parse(await obj.text())
        if (pws && parsedResult.data) {
            const parsedResult2: ArrayBuffer = (await decryptFirstPreKey({
                prekeys: parsedResult.prekeys,
                pws,
                fallbackHashAlgorithm: 'SHA-512',
                iterations: parsedResult.iterations,
                fn: async (data: [ArrayBuffer, string | null]) => {
                    if (data[1]) {
                        return Promise.reject('not for decryption')
                    }
                    return (
                        await decryptAESGCM({
                            data: parsedResult.data,
                            key: data[0],
                            nonce: parsedResult.nonce,
                        })
                    ).data
                },
            })) as any
            return cleanConfig(
                JSON.parse(
                    String.fromCharCode(...new Uint8Array(parsedResult2))
                ),
                window.location.href
            )
        }
        return cleanConfig(parsedResult, window.location.href)
    } else {
        // strip url from prekeys and decrypt
        const url = new URL(obj, window.location.href)
        const prekeys = url.searchParams.getAll('prekey')
        const keys = url.searchParams.getAll('key')
        const tokens = url.searchParams.getAll('token')
        const iterations = parseInt(
            url.searchParams.get('iterations') || '100000'
        )
        url.searchParams.delete('key')
        url.searchParams.delete('token')
        url.searchParams.delete('prekey')
        url.searchParams.delete('iterations')
        const contentResult = await fallback_fetch(url, {
            headers: {
                Authorization: tokens.join(','),
            },
        })
        if (!contentResult.ok) {
            return [null, false]
        }
        let content = await contentResult.blob()
        // try unencrypted
        try {
            return cleanConfig(
                JSON.parse(await content.text()),
                window.location.href
            )
        } catch (ignore1) {}
        const nonce = contentResult.headers.get('X-NONCE')
        const key_hashes = []
        const raw_keys = new Set<ArrayBuffer>()
        if (!nonce || (prekeys.length && !pws?.length)) {
            throw Error('requires nonce and/or pws')
        }
        for (const key of keys) {
            const split = key.split(':', 3)
            if (split.length == 3 && split[2]) {
                raw_keys.add(Buffer.from(split[2], 'base64'))
                key_hashes.push(`${split[0]}:${split[1]}`)
            } else {
                raw_keys.add(Buffer.from(split.at(-1) as string, 'base64'))
            }
        }
        if (pws) {
            const pkeys = await decryptPreKeys({
                prekeys,
                pws,
                iterations,
                fallbackHashAlgorithm: 'SHA-512',
            })

            for (const pkey of pkeys) {
                pkey[1] && key_hashes.push(pkey[1])
                raw_keys.add(pkey[0])
            }
        }
        if (!raw_keys.size) {
            console.debug('no prekeys decrypted')
            return [null, false]
        }

        // try direct way
        try {
            return cleanConfig(
                await Promise.any(
                    [...raw_keys].map(async (key) => {
                        const res = await decryptAESGCM({
                            key,
                            data: content,
                            nonce,
                        })
                        return JSON.parse(await new Blob([res.data]).text())
                    })
                )
            )
        } catch (ignore2) {}
        if (key_hashes.length == 0) {
            console.warn('could not decode result, no key_hashes found', keys)
            return [null, false]
        }
        let keysResponse
        try {
            keysResponse = await fallback_fetch(url, {
                headers: {
                    Authorization: tokens.join(','),
                    'X-KEY-HASH': key_hashes.join(','),
                },
            })
        } catch (exc) {
            console.error('key response errored', exc)
            return [null, false]
        }
        let keysResult
        // try walking the private key way
        try {
            keysResult = await keysResponse.json()
        } catch (exc) {
            console.error('Invalid response, expected json with keys', exc)
            return [null, false]
        }

        try {
            const text = await new Blob([
                await loadConfigUrl_helper(
                    url.href,
                    content,
                    nonce,
                    tokens,
                    [...raw_keys],
                    keysResult
                ),
            ]).text()
            let foundConfig
            try {
                foundConfig = cleanConfig(JSON.parse(text), url.href)
            } catch (e) {
                console.warn('failed to parse config file', e)
                return [null, false]
            }
            return foundConfig
        } catch (exc) {
            console.warn('retrieving private keys failed: ', exc)
        }
        return [null, false]
    }
}

export async function exportConfig(
    config: Interfaces.ConfigInterface | string,
    pws?: string[] | string,
    iterations?: number,
    name?: string
) {
    let newConfig: any
    if (pws && typeof pws === 'string') {
        pws = [pws]
    }
    if (typeof config !== 'string') {
        config = JSON.stringify(config)
    }
    if (pws && iterations) {
        const mainkey = crypto.getRandomValues(new Uint8Array(32))
        const encrypted = await encryptAESGCM({
            key: mainkey,
            data: utf8encoder.encode(config),
        })
        const prekeys = []
        for (const pw of pws) {
            prekeys.push(
                encryptPreKey({
                    prekey: mainkey,
                    pw,
                    hashAlgorithm: 'SHA-512',
                    iterations,
                })
            )
        }
        newConfig = JSON.stringify({
            data: await serializeToBase64(encrypted.data),
            iterations,
            nonce: await serializeToBase64(encrypted.nonce),
            prekeys: await Promise.all(prekeys),
        })
    } else {
        newConfig = config
    }
    if (!name) {
        return newConfig
    }
    saveAs(new File([newConfig], name, { type: 'text/plain;charset=utf-8' }))
}

export async function pruneOldTrustedKeys({
    config,
    key_hashes,
    lastChecked,
    validateHash = true,
}: {
    config: Interfaces.ConfigInterface
    key_hashes?: Set<string>
    lastChecked?: number
    validateHash?: boolean
}): Promise<Interfaces.ConfigInputInterface['trustedKeys']> {
    const ret: Interfaces.ConfigInputInterface['trustedKeys'] = {}
    const ops: Promise<any>[] = []
    const keys = key_hashes ? key_hashes : Object.keys(config.trustedKeys)
    const now = Math.floor(Date.now() / 1000)
    for (const key of keys) {
        const value = config.trustedKeys[key]
        if (!value) {
            continue
        }
        if (lastChecked && value.lastChecked >= lastChecked) {
            continue
        }
        const splitted = key.split(':')
        if (splitted.length != 2 || !Constants.mapHashNames[splitted[0]]) {
            ret[key] = null
            continue
        }
        const fn = async function () {
            const workingLinks = []
            for (const link of value.links) {
                const response = await fetch(link, {
                    mode: 'no-cors',
                    credentials: 'omit',
                    cache: 'no-cache',
                })
                if (!response.ok) {
                    // could be temporary
                    if (response.status >= 500 && response.status < 600) {
                        workingLinks.push(link)
                    }
                    continue
                }
                if (
                    !Constants.trusted_states.has(
                        '' + response.headers.get('X-STATE')
                    )
                ) {
                    continue
                }
                if (validateHash) {
                    if (await hashObject(response.blob(), splitted[0])) {
                        workingLinks.push(link)
                    }
                } else {
                    workingLinks.push(link)
                    await response.body?.cancel()
                }
            }
            if (workingLinks.length) {
                ret[key] = { links: workingLinks }
            }
        }
        ops.push(fn())
    }

    await Promise.all(ops)
    return ret
}
// update host specific or find a way to find missing refs
/**
export async function updateHash(config: ConfigInterface, old?: string) {
  const newHash = config.hosts[config.baseUrl].hashAlgorithms[0]
  if(old == newHash){
    return config
  }
  const updateMap = new Map<string, string>();
  const ret =  {
    ...config,
    certificates: Object.fromEntries(await Promise.all(Object.entries(config.certificates).map(async([hash, val]) =>{
      let newHash = updateMap.get(hash);
      if (!updateMap.has(hash)){
        updateMap.set(hash, await hashObject(val, newHash))
      }
      return [
        updateMap.get(hash),
        val
      ]
    }))),
    tokens: Object.fromEntries(await Promise.all(Object.entries(config.tokens).map(async([hash, val]) =>{
      let newHash = updateMap.get(hash);
      if (!updateMap.has(hash)){
        updateMap.set(hash, await hashObject(val, newHash))
      }
      return [
        updateMap.get(hash),
        val
      ]
    })))
  }
  return ret
} */
