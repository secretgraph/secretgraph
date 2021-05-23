import { ApolloClient } from '@apollo/client'
import { saveAs } from 'file-saver'

import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import { findConfigQuery } from '../queries/content'
import { RequireAttributes, UnpackPromise, ValueType } from '../utils/typing'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
    unserializeToCryptoKey,
} from './encryption'
import { b64toarr, mergeDeleteObjects, utf8encoder } from './misc'
import * as SetOps from './set'

const actionMatcher = /:(.*)/

export type ActionMapperEntry = {
    newHash: string
    oldHash: null | string
    note: string
    token: string
    configActions: Set<string>
    foundActions: Set<string>
}

export interface ActionInputEntry {
    newHash: string
    oldHash?: string
    token: string
    start: Date | ''
    stop: Date | ''
    note: string
    value: { [key: string]: any } & { action: string }
    update?: boolean
    delete?: boolean
    readonly?: boolean
    locked?: boolean
}

export type CertificateEntry = {
    newHash: string
    oldHash: string
    note: string
}

export async function generateActionMapper({
    nodeData,
    config,
    knownHashes,
    unknownTokens,
    unknownKeyhashes,
    hashAlgorithm,
}: {
    nodeData?: any
    config: Interfaces.ConfigInterface
    knownHashes?: { [hash: string]: string[] }
    unknownTokens: string[]
    unknownKeyhashes?: string[]
    hashAlgorithm: string
}) {
    // TODO: rework, name variables better and merge old actions of type other
    const prepareActions: PromiseLike<ActionMapperEntry | null>[] = []
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
    for (const token of unknownTokens) {
        const match = (token.match(actionMatcher) as RegExpMatchArray)[1]
        if (!match) {
            continue
        }
        prepareActions.push(
            serializeToBase64(
                unserializeToArrayBuffer(match).then((val) =>
                    crypto.subtle.digest(hashalgo, val)
                )
            ).then((val) => {
                if (knownHashes && knownHashes[val]) {
                    return null
                }
                return {
                    token,
                    note: '',
                    newHash: val,
                    oldHash: null,
                    configActions: new Set<string>(),
                    foundActions: inNodeFoundActions[val] || new Set(),
                }
            })
        )
    }
    for (const [hash, actions] of Object.entries(knownHashes || {})) {
        if (config.tokens[hash]) {
            prepareActions.push(
                serializeToBase64(
                    unserializeToArrayBuffer(config.tokens[hash].data).then(
                        (val) => crypto.subtle.digest(hashalgo, val)
                    )
                ).then((val) => {
                    return {
                        newHash: val,
                        oldHash: hash,
                        note: config.tokens[hash].note,
                        token: config.tokens[hash].data,
                        configActions: new Set<string>(actions),
                        foundActions: inNodeFoundActions[val] || new Set(),
                    }
                })
            )
        }
    }
    if (unknownKeyhashes) {
        for (const hash of unknownKeyhashes) {
            if (config.tokens[hash]) {
                prepareActions.push(
                    serializeToBase64(
                        unserializeToArrayBuffer(config.tokens[hash].data).then(
                            (val) => crypto.subtle.digest(hashalgo, val)
                        )
                    ).then((val) => {
                        return {
                            newHash: val,
                            oldHash: hash,
                            note: config.tokens[hash].note,
                            token: config.tokens[hash].data,
                            configActions: new Set(),
                            foundActions: inNodeFoundActions[val] || new Set(),
                        }
                    })
                )
            }
        }
    }
    return Object.fromEntries(
        (await Promise.all(prepareActions))
            .filter((val) => val)
            .map((val: ActionMapperEntry) => {
                return [val.newHash, val]
            })
    )
}

export async function transformActions({
    actions,
    hashAlgorithm,
    mapper: _mapper,
}: {
    actions: ActionInputEntry[]
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
                        await unserializeToArrayBuffer(val.token)
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
                configUpdate.tokens[val.oldHash] = null
                console.debug('hash of deleted object:', val.oldHash)
                return
            }
            // updates config with new action information
            if (val.update) {
                if (!mapperval) {
                    throw Error('requires mapper')
                }
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
            }
            // update note or create new entry
            if (!mapperval || mapperval?.note != val.note) {
                configUpdate.tokens[newHash] = {
                    data: val.token,
                    note: val.note,
                }
            }

            if (val.locked) {
                return
            }
            if (!hashes[newHash]) {
                hashes[newHash] = []
            }
            ;(hashes[newHash] as NonNullable<typeof hashes[string]>).push(
                val.value.action
            )
            finishedActions.push({
                existingHash: val.oldHash || undefined,
                start: val.start ? new Date(val.start) : undefined,
                stop: val.stop ? new Date(val.stop) : undefined,
                value: JSON.stringify(val.value),
                key: val.token,
            })
        })
    )
    return {
        configUpdate,
        actions: finishedActions,
        hashes,
    }
}
