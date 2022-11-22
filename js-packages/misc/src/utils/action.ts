import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import { RequireAttributes, UnpackPromise } from '../typing'
import { serializeToBase64, unserializeToArrayBuffer } from './encoding'
import { findWorkingHashAlgorithms, hashObject } from './hashing'
import * as SetOps from './set'

const actionMatcher = /:(.*)/

export interface CertificateEntry {
    type: 'certificate'
    signWith: boolean
    newHash: string
    oldHash: null | string
    note: string
    data: string
    hasUpdate: boolean
}
export interface ActionMapperEntry
    extends Omit<CertificateEntry, 'type' | 'signWith'> {
    type: 'action'
    // name, is cluster (unknown is also false)
    actions: Set<`${string},${'true' | 'false'}`>
    system: boolean
}
export interface CertificateInputEntry {
    type: 'certificate'
    data: string
    newHash: string
    oldHash?: string
    note: string
    signWith: boolean
    update?: boolean
    delete?: boolean
    readonly?: boolean
    locked: true
}

export interface ActionInputEntry
    extends Omit<CertificateInputEntry, 'type' | 'locked' | 'signWith'> {
    type: 'action'
    start: Date | ''
    stop: Date | ''
    value: { [key: string]: any } & { action: string }
    locked?: boolean
}

type knownHashesType =
    | { [hash: string]: string[] }
    | { keyHash: string; type: string }[] // cluster or content hashes
type knownHashesTypeInput =
    | (knownHashesType | null | undefined)[]
    | (knownHashesType | null | undefined) // cluster or content hashes

// TODO: mark actions from cluster
export async function generateActionMapper({
    config,
    knownHashesCluster,
    knownHashesContent,
    unknownTokens,
    unknownKeyhashes,
    hashAlgorithms,
}: {
    config: Interfaces.ConfigInterface
    knownHashesCluster?: knownHashesTypeInput
    knownHashesContent?: knownHashesTypeInput
    unknownTokens?: string[] // eg. tokens in url
    unknownKeyhashes?: string[] // eg tags
    hashAlgorithms: string[]
}): Promise<{ [newHash: string]: ActionMapperEntry | CertificateEntry }> {
    const hashalgos = findWorkingHashAlgorithms(hashAlgorithms)
    const tokenToHash: Record<string, string> = {}
    const upgradeHash: Record<string, string> = {}

    const foundHashes = new Set<string>(
        unknownKeyhashes ? unknownKeyhashes : []
    )

    // merge knownHashes and initialize foundHashes
    const knownHashes: {
        [hash: string]: Set<`${string},${'true' | 'false'}`>
    } = {}
    if (!(knownHashesCluster instanceof Array)) {
        knownHashesCluster = knownHashesCluster ? [knownHashesCluster] : []
    }

    if (!(knownHashesContent instanceof Array)) {
        knownHashesContent = knownHashesContent ? [knownHashesContent] : []
    }
    function helper(arr: knownHashesType[], isCluster: boolean) {
        for (const entry of arr) {
            if (entry instanceof Array) {
                // typeof node actions
                for (const el of entry) {
                    if (!el) {
                        console.debug(
                            'known hashes contains invalid entry',
                            el,
                            'context',
                            entry
                        )
                        continue
                    }
                    if (!knownHashes[el.keyHash]) {
                        foundHashes.add(el.keyHash)
                        knownHashes[el.keyHash] = new Set<`${string},${
                            | 'true'
                            | 'false'}`>([`${el.type},${isCluster}`])
                    } else {
                        knownHashes[el.keyHash].add(`${el.type},${isCluster}`)
                    }
                }
            } else if (entry) {
                if (!entry) {
                    console.debug('known hashes contains invalid entry', entry)
                    continue
                }
                for (const [hash, val] of Object.entries(entry)) {
                    foundHashes.add(hash)
                    knownHashes[hash] = SetOps.union(
                        knownHashes[hash] || [],
                        val.map<`${string},${'true' | 'false'}`>(
                            (v) => `${v},${isCluster}`
                        )
                    )
                }
            }
        }
    }
    helper(knownHashesCluster as knownHashesType[], true)
    helper(knownHashesContent as knownHashesType[], false)
    for (const val of Object.values(knownHashes)) {
        if (val.size == 2 && val.has('other,true') && val.has('other,false')) {
            // skip
        } else if (val.size > 1) {
            if (val.has('other,true')) {
                val.delete('other,true')
            }
            if (val.has('other,false')) {
                val.delete('other,false')
            }
        }
    }
    const updateHashOps = []
    for (const t of unknownTokens || []) {
        if (!t) {
            console.debug('unknown tokens contains invalid entry', t)
            continue
        }
        let firstHash: string | undefined = undefined
        for (const halgo of hashalgos) {
            updateHashOps.push(
                hashObject(t, halgo).then((data) => {
                    if (!firstHash) {
                        firstHash = data
                        tokenToHash[t] = data
                    }
                    upgradeHash[data] = firstHash
                })
            )
        }
    }

    // generate mapper hash new hash
    for (const hash of foundHashes) {
        let found = false
        if (config.tokens[hash]) {
            found = true
            updateHashOps.push(
                hashObject(config.tokens[hash].data, hashalgos[0]).then(
                    (data) => {
                        upgradeHash[hash] = data
                    }
                )
            )
        }
        if (config.certificates[hash]) {
            found = true
            updateHashOps.push(
                hashObject(config.certificates[hash].data, hashalgos[0]).then(
                    (data) => {
                        upgradeHash[hash] = data
                    }
                )
            )
        }
        if (!found) {
            upgradeHash[hash] = hash
        }
    }
    await Promise.all(updateHashOps)

    const actions: { [newHash: string]: ActionMapperEntry | CertificateEntry } =
        {}
    for (const [hash, actionsRaw] of Object.entries(knownHashes)) {
        if (
            !actions[upgradeHash[hash]] ||
            actions[upgradeHash[hash]].oldHash ==
                actions[upgradeHash[hash]].newHash
        ) {
            let hasActionUpdate = false
            if (
                actionsRaw.has('other,true') &&
                actionsRaw.has('other,false') &&
                actionsRaw.size == 2
            ) {
            } else if (actionsRaw.size > 1) {
                if (actionsRaw.has('other,true')) {
                    actionsRaw.delete('other,true')
                    hasActionUpdate = true
                }
                if (actionsRaw.has('other,false')) {
                    actionsRaw.delete('other,false')
                    hasActionUpdate = true
                }
            }
            let hasUpdate =
                actions[upgradeHash[hash]] &&
                actions[upgradeHash[hash]].oldHash !=
                    actions[upgradeHash[hash]].newHash
            if (config.tokens[upgradeHash[hash]]) {
                const data = config.tokens[upgradeHash[hash]]
                actions[upgradeHash[hash]] = {
                    type: 'action',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: data.note,
                    data: data.data,
                    system: data.system || false,
                    actions: actionsRaw,
                    hasUpdate: hasActionUpdate || hasUpdate,
                }
            } else if (config.tokens[hash]) {
                const data = config.tokens[hash]
                actions[upgradeHash[hash]] = {
                    type: 'action',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: data.note,
                    data: data.data,
                    system: data.system || false,
                    actions: actionsRaw,
                    hasUpdate: hasActionUpdate || hasUpdate,
                }
            }
            if (config.certificates[upgradeHash[hash]]) {
                const data = config.certificates[upgradeHash[hash]]
                actions[upgradeHash[hash]] = {
                    type: 'certificate',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: data.note,
                    data: data.data,
                    signWith: data.signWith,
                    hasUpdate,
                }
            } else if (config.certificates[hash]) {
                const data = config.certificates[hash]
                actions[upgradeHash[hash]] = {
                    type: 'certificate',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: data.note,
                    data: data.data,
                    signWith: data.signWith,
                    hasUpdate,
                }
            }
        }
    }

    // always action
    for (const [token, hash] of Object.entries(tokenToHash)) {
        // ignore known tokens
        if (actions[hash]) {
            continue
        }
        if (!hash) {
            console.error('invalid hash', token, hash)
            continue
        }
        if (!upgradeHash[hash]) {
            console.error(
                'invalid upgrade hash',
                token,
                hash,
                upgradeHash[hash]
            )
            continue
        }
        // hash is always newest
        if (!actions[upgradeHash[hash]]) {
            if (config.tokens[upgradeHash[hash]]) {
                const data = config.tokens[upgradeHash[hash]]
                actions[upgradeHash[hash]] = {
                    type: 'action',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: data.note || '',
                    data: data.data || token,
                    system: data.system || false,
                    actions: new Set(['other,false']),
                    hasUpdate: !data.data,
                }
            } else if (config.tokens[hash]) {
                const data = config.tokens[hash]
                actions[upgradeHash[hash]] = {
                    type: 'action',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: data.note || '',
                    data: data.data || token,
                    system: data.system || false,
                    actions: new Set(['other,false']),
                    hasUpdate: !data.data,
                }
            } else {
                actions[upgradeHash[hash]] = {
                    type: 'action',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: '',
                    data: token,
                    system: false,
                    actions: new Set(['other,false']),
                    hasUpdate: true,
                }
            }
        } else if (
            actions[upgradeHash[hash]].oldHash ==
            actions[upgradeHash[hash]].newHash
        ) {
            actions[upgradeHash[hash]].hasUpdate = true
        }
    }
    return actions
}

export async function transformActions({
    actions,
    hashAlgorithm,
    mapper: _mapper,
    ignoreCluster = true,
}: {
    actions: (ActionInputEntry | CertificateInputEntry)[]
    hashAlgorithm: string
    mapper?:
        | ReturnType<typeof generateActionMapper>
        | UnpackPromise<ReturnType<typeof generateActionMapper>>
    ignoreCluster?: boolean
}) {
    const mapper = await _mapper
    const finishedActions: Interfaces.ActionInterface[] = []
    const configUpdate: RequireAttributes<
        Interfaces.ConfigInputInterface,
        'hosts' | 'tokens' | 'certificates'
    > = {
        hosts: {},
        tokens: {},
        certificates: {},
    }
    const hashes: Interfaces.ConfigClusterInterface<null>['hashes'] = {}
    await Promise.all(
        actions.map(async (val) => {
            if (val.readonly) {
                return
            }
            // autogenerate newHash if not available
            const newHash =
                val.newHash || (await hashObject(val.data, hashAlgorithm))
            // find mapper value
            const mapperval =
                mapper && mapper[newHash] ? mapper[newHash] : undefined
            // delete action
            if (val.delete) {
                if (!val.oldHash) {
                    throw Error('requires oldHash')
                }
                finishedActions.push({
                    existingHash: val.oldHash,
                    value: '"delete"',
                })
                // tokens can be shared!!! check that first or better use cleaner function to remove orphan tokens
                /*if (val.type == 'action') {
                    configUpdate.tokens[val.oldHash] = null
                } else {
                    console.warn('tried to delete certificate')
                }*/
                console.debug('hash of deleted object:', val.oldHash)
                return
            }
            // updates config with new action information
            let activeHash = newHash
            if (val.update) {
                if (!mapperval) {
                    throw Error('requires mapper')
                }
                if (mapperval.type == 'action') {
                    let actions = [...mapperval.actions]
                    if (ignoreCluster) {
                        actions = actions.filter((val) => !val[1])
                    }
                    hashes[newHash] = actions.map((val) => val[0])
                    if (mapperval.oldHash && val.newHash != mapperval.oldHash) {
                        hashes[mapperval.oldHash] = null
                        configUpdate.tokens[mapperval.oldHash] = null
                    }
                } else {
                    hashes[newHash] = []
                    // move certificate
                    if (mapperval.oldHash && val.newHash != mapperval.oldHash) {
                        hashes[mapperval.oldHash] = null
                        configUpdate.certificates[mapperval.oldHash] = null
                    }
                }
            } else if (mapperval?.oldHash) {
                activeHash = mapperval.oldHash
            }
            if (val.type == 'action') {
                // update note or create new entry
                if (
                    !mapperval ||
                    val.update ||
                    // is created
                    !mapperval.oldHash ||
                    mapperval.note != val.note
                ) {
                    configUpdate.tokens[activeHash] = {
                        data: val.data,
                        note: val.note,
                        system: false,
                    }
                }
                if (val.locked || val.value.action == 'other') {
                    return
                }
                if (!hashes[activeHash]) {
                    hashes[activeHash] = []
                }
                hashes[activeHash]!.push(val.value.action)
                // send updates
                finishedActions.push({
                    existingHash: val.oldHash || undefined,
                    start: val.start ? new Date(val.start) : undefined,
                    stop: val.stop ? new Date(val.stop) : undefined,
                    value: JSON.stringify(val.value),
                    key: val.data,
                })
            } else {
                // update note or create new entry
                if (!mapperval || val.update || mapperval.note != val.note) {
                    configUpdate.certificates[activeHash] = {
                        data: val.data,
                        note: val.note,
                        signWith: val.signWith,
                    }
                }
            }
        })
    )
    return {
        configUpdate,
        actions: finishedActions,
        hashes,
    }
}
