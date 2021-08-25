import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import { RequireAttributes, UnpackPromise } from '../typing'
import { serializeToBase64, unserializeToArrayBuffer } from './encryption'
import * as SetOps from './set'

const actionMatcher = /:(.*)/

export interface CertificateEntry {
    type: 'certificate'
    newHash: string
    oldHash: null | string
    note: string
    data: string
}
export interface ActionMapperEntry extends Omit<CertificateEntry, 'type'> {
    type: 'action'
    configActions: Set<string>
    foundActions: Set<string>
}
export interface CertificateInputEntry {
    type: 'certificate'
    data: string
    newHash?: string
    oldHash?: string
    note: string
    update?: boolean
    delete?: boolean
    readonly?: boolean
    locked: true
}

export interface ActionInputEntry
    extends Omit<CertificateInputEntry, 'type' | 'locked'> {
    type: 'action'
    start: Date | ''
    stop: Date | ''
    value: { [key: string]: any } & { action: string }
    locked?: boolean
}

export async function generateActionMapper({
    nodeData,
    config,
    knownHashes: knownHashesIntern,
    unknownTokens,
    unknownKeyhashes,
    hashAlgorithm,
}: {
    nodeData?: any
    config: Interfaces.ConfigInterface
    knownHashes?: (
        | { [hash: string]: string[] }
        | { keyHash: string; type: string }[]
    )[] // cluster or content hashes
    unknownTokens?: string[] // eg. tokens in url
    unknownKeyhashes?: string[] // eg tags
    hashAlgorithm: string
}): Promise<{ [newHash: string]: ActionMapperEntry | CertificateEntry }> {
    const knownHashes: { [hash: string]: Set<string> } = {}
    for (const k of knownHashesIntern || []) {
        if (k instanceof Array) {
            for (const el of k) {
                if (!knownHashes[el.keyHash]) {
                    knownHashes[el.keyHash] = new Set([el.type])
                } else {
                    knownHashes[el.keyHash].add(el.type)
                }
            }
        } else {
            for (const [hash, val] of Object.entries(k)) {
                knownHashes[hash] = SetOps.union(knownHashes[hash] || [], val)
            }
        }
    }
    // TODO: rework, name variables better and merge old actions of type other
    const prepareActionsAndCerts: PromiseLike<
        ActionMapperEntry | CertificateEntry | null
    >[] = []
    const inNodeFoundActions: {
        [hash: string]: Set<string>
    } = {}
    for (const entry of nodeData?.availableActions || []) {
        if (!inNodeFoundActions[entry.keyHash]) {
            inNodeFoundActions[entry.keyHash] = new Set()
        }
        inNodeFoundActions[entry.keyHash].add(entry.type)
    }
    const hashalgo = Constants.mapHashNames[hashAlgorithm].operationName
    for (const [hash, configActions] of Object.entries(knownHashes)) {
        if (config.tokens[hash]) {
            prepareActionsAndCerts.push(
                serializeToBase64(
                    unserializeToArrayBuffer(config.tokens[hash].data).then(
                        (val) => crypto.subtle.digest(hashalgo, val)
                    )
                ).then((val) => {
                    let newSet = inNodeFoundActions[val]
                        ? new Set(inNodeFoundActions[val])
                        : new Set<string>()
                    if (newSet.has('other')) {
                        newSet.delete('other')
                        newSet = SetOps.union(
                            newSet,
                            SetOps.difference(
                                configActions,
                                Constants.protectedActions
                            )
                        )
                    }
                    return {
                        type: 'action',
                        newHash: val,
                        oldHash: hash,
                        note: config.tokens[hash].note,
                        data: config.tokens[hash].data,
                        configActions,
                        foundActions: newSet,
                        update: false,
                    }
                })
            )
        }
    }
    if (unknownTokens) {
        for (const token of unknownTokens) {
            const match = (token.match(actionMatcher) as RegExpMatchArray)[1]
            if (!match) {
                continue
            }
            const prom = serializeToBase64(
                unserializeToArrayBuffer(match).then((val) =>
                    crypto.subtle.digest(hashalgo, val)
                )
            )
            prepareActionsAndCerts.push(
                prom.then((val) => {
                    if (config.certificates[val]) {
                        return {
                            type: 'certificate',
                            newHash: val,
                            oldHash: val,
                            note: config.certificates[val].note,
                            data: config.certificates[val].data,
                        }
                    }
                    return null
                })
            )
            prepareActionsAndCerts.push(
                prom.then((val) => {
                    if (knownHashes && knownHashes[val]) {
                        return null
                    }
                    return {
                        type: 'action',
                        data: token,
                        note: '',
                        newHash: val,
                        oldHash: null,
                        configActions: new Set<string>(),
                        foundActions: inNodeFoundActions[val] || new Set(),
                        update: false,
                    }
                })
            )
        }
    }
    if (unknownKeyhashes) {
        for (const hash of unknownKeyhashes) {
            if (config.tokens[hash]) {
                prepareActionsAndCerts.push(
                    serializeToBase64(
                        unserializeToArrayBuffer(config.tokens[hash].data).then(
                            (val) => crypto.subtle.digest(hashalgo, val)
                        )
                    ).then((val) => {
                        return {
                            type: 'action',
                            newHash: val,
                            oldHash: hash,
                            note: config.tokens[hash].note,
                            data: config.tokens[hash].data,
                            configActions: new Set(),
                            foundActions: inNodeFoundActions[val] || new Set(),
                        }
                    })
                )
            }
            if (config.certificates[hash]) {
                prepareActionsAndCerts.push(
                    serializeToBase64(
                        unserializeToArrayBuffer(
                            config.certificates[hash].data
                        ).then((val) => crypto.subtle.digest(hashalgo, val))
                    ).then((val) => {
                        const cert = config.certificates[hash]
                        return {
                            type: 'certificate',
                            newHash: val,
                            oldHash: hash,
                            note: cert.note,
                            data: cert.data,
                        }
                    })
                )
            }
        }
    }
    const actions: { [newHash: string]: ActionMapperEntry | CertificateEntry } =
        {}
    for (const entry of await Promise.all(prepareActionsAndCerts)) {
        if (!entry) {
            continue
        }
        if (!actions[entry.newHash]) {
            actions[entry.newHash] = entry
        }
    }
    return actions
}

export async function transformActions({
    actions,
    hashAlgorithm,
    mapper: _mapper,
}: {
    actions: (ActionInputEntry | CertificateInputEntry)[]
    hashAlgorithm: string
    mapper?:
        | ReturnType<typeof generateActionMapper>
        | UnpackPromise<ReturnType<typeof generateActionMapper>>
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
                val.newHash ||
                (await serializeToBase64(
                    crypto.subtle.digest(
                        hashAlgorithm,
                        await unserializeToArrayBuffer(val.data)
                    )
                ))
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
                    const newHashValues = new Set<string>()
                    for (const v of mapperval.configActions) {
                        if (!Constants.protectedActions.has(v)) {
                            if (mapperval.foundActions.has(v)) {
                                newHashValues.add(v)
                            }
                        } else {
                            if (mapperval.foundActions.has('other')) {
                                newHashValues.add(v)
                            }
                        }
                    }
                    for (const v of mapperval.configActions) {
                        if (v == 'other') {
                            if (!newHashValues.size) {
                                newHashValues.add(v)
                            }
                        } else {
                            newHashValues.add(v)
                        }
                    }
                    hashes[newHash] = [...newHashValues]
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
                    }
                }
                if (val.locked || val.value.action == 'other') {
                    return
                }
                if (!hashes[activeHash]) {
                    hashes[activeHash] = []
                }
                ;(
                    hashes[activeHash] as NonNullable<typeof hashes[string]>
                ).push(val.value.action)
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
