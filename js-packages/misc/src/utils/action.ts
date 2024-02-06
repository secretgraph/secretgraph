import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import { RequireAttributes, UnpackPromise, ValueType } from '../typing'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
    utf8encoder,
} from './encoding'
import { hashObject, hashToken } from './hashing'
import { findWorkingAlgorithms } from './crypto'
import { compareArray } from './misc'
import { createSignatureReferences } from './references'
import * as SetOps from './set'

const actionMatcher = /:(.*)/

export interface CertificateMapperEntry {
    type: 'certificate'
    signWith: boolean
    newHash: string
    oldHash: null | string
    note: string
    data: string
    hasUpdate: boolean
    validFor: string[]
}
export interface ActionMapperEntry
    extends Omit<CertificateMapperEntry, 'type' | 'signWith'> {
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
    validFor: string[]
}

export interface ActionInputEntry
    extends Omit<CertificateInputEntry, 'type' | 'locked' | 'signWith'> {
    type: 'action'
    start: Date | ''
    stop: Date | ''
    value: { [key: string]: any } & { action: string }
    locked?: boolean
}

type knownHashesTypeInner =
    | {
          keyHash: string
          type: string
      }
    | { [hash: string]: string[] }
    | null
    | undefined

type knownHashesTypeInput =
    | knownHashesTypeInner
    | knownHashesTypeInner[]
    | knownHashesTypeInput[]

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
}): Promise<{
    [newHash: string]: ActionMapperEntry | CertificateMapperEntry
}> {
    const hashalgos = findWorkingAlgorithms(hashAlgorithms, 'hash')
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
    function helper(inp: knownHashesTypeInput, isCluster: boolean) {
        if (inp instanceof Array) {
            for (const entry of inp) {
                helper(entry, isCluster)
            }
            return
        }
        if (inp) {
            if ((inp as any)['keyHash']) {
                const actionEntry = inp as {
                    keyHash: string
                    type: string
                }
                if (!knownHashes[actionEntry.keyHash]) {
                    foundHashes.add(actionEntry.keyHash)
                    knownHashes[actionEntry.keyHash] = new Set<`${string},${
                        | 'true'
                        | 'false'}`>([`${actionEntry.type},${isCluster}`])
                } else {
                    knownHashes[actionEntry.keyHash].add(
                        `${actionEntry.type},${isCluster}`
                    )
                }
            } else {
                try {
                    for (const [hash, val] of Object.entries(
                        inp as { [hash: string]: string[] }
                    )) {
                        knownHashes[hash] = SetOps.union(
                            knownHashes[hash] || [],
                            val.map<`${string},${'true' | 'false'}`>(
                                (v) => `${v},${isCluster}`
                            )
                        )
                        foundHashes.add(hash)
                    }
                } catch (exc) {
                    console.error('invalid input', inp, exc)
                }
            }
        }
    }
    helper(knownHashesCluster, true)
    helper(knownHashesContent, false)
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
        let rawT: string = t.split(':', 2).at(-1) as string
        let firstHash: string | undefined = undefined
        for (const halgo of hashalgos) {
            updateHashOps.push(
                hashToken(rawT, halgo).then((data) => {
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
                hashToken(config.tokens[hash].data, hashalgos[0]).then(
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

    const actions: {
        [newHash: string]: ActionMapperEntry | CertificateMapperEntry
    } = {}

    const signWithHashes = new Set(config.signWith[config.slots[0]] || [])

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
                    validFor: [],
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
                    validFor: [],
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
                    signWith: signWithHashes.has(upgradeHash[hash]),
                    hasUpdate,
                    validFor: [],
                }
            } else if (config.certificates[hash]) {
                const data = config.certificates[hash]
                actions[upgradeHash[hash]] = {
                    type: 'certificate',
                    newHash: upgradeHash[hash],
                    oldHash: hash,
                    note: data.note,
                    data: data.data,
                    signWith: signWithHashes.has(hash),
                    hasUpdate,
                    validFor: [],
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
                    validFor: [],
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
                    validFor: [],
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
                    validFor: [],
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

export function annotateAndMergeMappers({
    mappers,
    validFor,
}: {
    mappers: UnpackPromise<ReturnType<typeof generateActionMapper>>[]
    validFor?: string[]
}) {
    if (validFor && mappers.length != validFor.length) {
        throw Error('Mismatch between length mappers and length validFor')
    }
    const newMapper: UnpackPromise<ReturnType<typeof generateActionMapper>> =
        {}

    for (let mapperindex = 0; mapperindex < mappers.length; mapperindex++) {
        const mapper = mappers[mapperindex]
        for (const [key, value] of Object.entries(mapper)) {
            if (value.type == 'certificate') {
                if (newMapper[key]) {
                    continue
                }
                const newValidFor: string[] = []
                if (validFor) {
                    for (let index = 0; index < mappers.length; index++) {
                        if (mappers[index][key]) {
                            newValidFor.push(validFor[index])
                        }
                    }
                    newMapper[key] = {
                        ...value,
                        validFor: newValidFor,
                    }
                }
            } else {
                const newValidFor: string[] = []
                if (validFor) {
                    let alreadyExists = false
                    for (let index = 0; index < mappers.length; index++) {
                        if (
                            mappers[index][key] &&
                            !SetOps.isNotEq(
                                (mappers[index][key] as ActionMapperEntry)
                                    .actions,
                                value.actions
                            )
                        ) {
                            if (index < mapperindex) {
                                alreadyExists = true
                                break
                            } else {
                                newValidFor.push(validFor[index])
                            }
                        }
                    }
                    if (!alreadyExists) {
                        newValidFor.sort()
                        newMapper[`${key},${newValidFor.join(',')}`] = {
                            ...value,
                            validFor: newValidFor,
                        }
                    }
                } else {
                    if (newMapper[key]) {
                        throw Error(
                            'Cannot merge multiple mappers, with same hashes without annotatation'
                        )
                    }
                    newMapper[key] = value
                }
            }
        }
    }

    return newMapper
}

export function mapperToArray(
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>,
    {
        lockExisting = true,
        readonlyCluster = true,
    }: {
        lockExisting?: boolean
        readonlyCluster?: boolean
    }
) {
    const elements: (ActionInputEntry | CertificateInputEntry)[] = []
    Object.values<ValueType<typeof mapper>>(mapper).forEach((value) => {
        if (value.type == 'action') {
            for (const val of value.actions) {
                const [actionType, isCluster] = val.split(',', 2)
                elements.push({
                    type: 'action',
                    data: value.data,
                    newHash: value.newHash,
                    oldHash: value.oldHash || undefined,
                    start: '',
                    stop: '',
                    note: value.note,
                    value: {
                        action: actionType,
                    },
                    update: value.hasUpdate,
                    delete: false,
                    readonly:
                        value.system ||
                        (isCluster == 'true' && readonlyCluster),
                    locked: lockExisting,
                    validFor: value.validFor,
                })
            }
        } else {
            elements.push({
                type: 'certificate',
                data: value.data,
                newHash: value.newHash,
                oldHash: value.oldHash || undefined,
                note: value.note,
                update: value.hasUpdate,
                signWith: value.signWith,
                delete: false,
                readonly: false,
                locked: true,
                validFor: value.validFor,
            })
        }
    })
    return elements
}

export function extractMapperValue(
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>> | undefined,
    keyElement: ActionInputEntry | CertificateInputEntry,
    newHash: string,
    validFor: undefined | string
) {
    let mapperval: ActionMapperEntry | CertificateMapperEntry | undefined =
        undefined
    if (mapper) {
        if (!validFor || keyElement.type == 'certificate') {
            mapperval = mapper[newHash]
        } else {
            // shortcut
            mapperval = mapper[`${newHash},${validFor}`]
            if (!mapperval) {
                const key = Object.keys(mapper).find(
                    (key) =>
                        key.startsWith(newHash) && key.includes(`,${validFor}`)
                )
                if (key) {
                    mapperval = mapper[key]
                }
            }
        }
    }
    return mapperval
}

export async function transformActions({
    actions,
    hashAlgorithm,
    signatureAlgorithm,
    mapper: _mapper,
    config,
    signKeys = [],
    ignoreCluster = true,
    validFor,
}: {
    actions: (ActionInputEntry | CertificateInputEntry)[]
    hashAlgorithm: string
    signatureAlgorithm: string
    config?: Interfaces.ConfigInterface
    signKeys?: ArrayBuffer[]
    mapper?:
        | ReturnType<typeof generateActionMapper>
        | UnpackPromise<ReturnType<typeof generateActionMapper>>
    ignoreCluster?: boolean
    validFor?: string
}) {
    const mapper = await _mapper
    const finishedActions: Interfaces.ActionInterface[] = []
    const configUpdate: RequireAttributes<
        Interfaces.ConfigInputInterface,
        'hosts' | 'tokens' | 'certificates' | 'signWith'
    > = {
        hosts: {},
        tokens: {},
        certificates: {},
        signWith: {},
    }
    const hashes: Interfaces.ConfigHashesInterface<null> = {}
    await Promise.all(
        actions.map(async (val) => {
            if (val.readonly) {
                return
            }
            if (validFor && !val.validFor.includes(validFor)) {
                return
            }
            // autogenerate newHash if not available
            const newHash =
                val.newHash ||
                (val.type == 'certificate'
                    ? await hashObject(val.data, hashAlgorithm)
                    : await hashToken(val.data, hashAlgorithm))
            // find mapper value
            let mapperval = extractMapperValue(mapper, val, newHash, validFor)
            if (val.delete) {
                // delete action
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
                    let actions = [...mapperval.actions].map((val) =>
                        val.split(',')
                    )
                    if (ignoreCluster) {
                        actions = actions.filter((val) => !val[1])
                    }
                    hashes[newHash] = actions.map((val) => val[0])
                    if (
                        mapperval.oldHash &&
                        val.newHash != mapperval.oldHash
                    ) {
                        hashes[mapperval.oldHash] = null
                        configUpdate.tokens[mapperval.oldHash] = null
                    }
                } else {
                    hashes[newHash] = []
                    // move certificate
                    if (
                        mapperval.oldHash &&
                        val.newHash != mapperval.oldHash
                    ) {
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
                // in case of auth, autogenerate signatures
                if (val.value.action == 'auth') {
                    if (!signKeys.length) {
                        throw Error('auth action without signkeys')
                    }
                    val.value.signatures = (
                        await createSignatureReferences(
                            Buffer.from(
                                `${val.value.requester}${val.value.challenge}`
                            ).buffer,
                            signKeys,
                            hashAlgorithm,
                            signatureAlgorithm
                        )
                    ).map((val) => val.extra)
                }
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
                if (
                    (!mapperval && val.signWith) ||
                    (mapperval?.type == 'certificate' &&
                        mapperval.signWith != val.signWith)
                ) {
                    if (!config) {
                        throw Error(
                            'no config specified but certificate signWith upgrades'
                        )
                    }
                    if (val.signWith) {
                        if (!configUpdate.signWith[config.slots[0]]) {
                            configUpdate.signWith[config.slots[0]] = [
                                ...(config.signWith[config.slots[0]] || []),
                            ]
                        }
                        configUpdate.signWith[config.slots[0]].push(activeHash)
                    } else {
                        if (!configUpdate.signWith[config.slots[0]]) {
                            configUpdate.signWith[config.slots[0]] = (
                                config.signWith[config.slots[0]] || []
                            ).filter((hash) => hash != activeHash)
                        }
                    }
                }
            }
        })
    )
    return {
        configUpdate,
        actions: finishedActions,
        // hashes for updating hosts in configUpdate
        hashes,
    }
}
