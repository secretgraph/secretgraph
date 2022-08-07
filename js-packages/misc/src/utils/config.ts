import { ApolloClient } from '@apollo/client'
import { findConfigQuery } from '@secretgraph/graphql-queries/content'
import { saveAs } from 'file-saver'

import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import {
    decryptAESGCM,
    decryptFirstPreKey,
    decryptPreKeys,
    decryptRSAOEAP,
    encryptAESGCM,
    encryptPreKey,
    findWorkingHashAlgorithms,
    hashObject,
    serializeToBase64,
    unserializeToArrayBuffer,
    unserializeToCryptoKey,
} from './encryption'
import { b64toarr, mergeDeleteObjects, utf8encoder } from './misc'
import * as SetOps from './set'

export function cleanConfig(
    config: Interfaces.ConfigInterface | null | undefined
) {
    if (!config) {
        return null
    }
    if (
        !config.baseUrl ||
        !(config.hosts instanceof Object) ||
        !(config.tokens instanceof Object) ||
        !(config.certificates instanceof Object) ||
        !config.configCluster
    ) {
        console.error(config)
        return null
    }
    for (const [key, val] of Object.entries(config.tokens)) {
        if (typeof val == 'string') {
            config.tokens[key] = {
                data: val,
                note: '',
                system: false,
            }
        }
    }
    for (const [key, val] of Object.entries(config.certificates)) {
        if (typeof val == 'string') {
            config.certificates[key] = {
                data: val,
                note: '',
            }
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

    return config
}

export async function checkConfigObject(
    client: ApolloClient<any>,
    config: Interfaces.ConfigInterface
) {
    const authInfo = authInfoFromConfig({
        config,
        url: config.baseUrl,
        clusters: new Set([config.configCluster]),
    })
    const cert: Uint8Array | null = authInfo.certificateHashes.length
        ? b64toarr(config.certificates[authInfo.certificateHashes[0]].data)
        : null
    if (!authInfo.tokens.length || !cert) {
        return false
    }
    const { data } = await client.query({
        query: findConfigQuery,
        variables: {
            cluster: config.configCluster,
            authorization: authInfo.tokens,
        },
    })
    if (!data || data.secretgraph.contents.edges.length < 1) {
        return false
    }
    if (data.secretgraph.contents.edges.length > 1) {
        console.error(
            'Too many config objects found',
            data.secretgraph.contents.edges
        )
        return false
    }
    return true
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
            const response = await fetch(new URL(link, url), {
                headers: { Authorization: tokens.join(',') },
            })
            if (!response.ok) {
                throw Error('Invalid response')
            }
            const nonce = response.headers.get('X-NONCE')
            if (!nonce) {
                throw Error('Missing nonce')
            }
            const blob = await response.blob()
            return await Promise.any(
                keys.map(async (key) => {
                    const privkey = (
                        await decryptAESGCM({
                            data: blob,
                            key: key,
                            nonce,
                        })
                    ).data
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
): Interfaces.ConfigInterface | null {
    let result = obj.getItem('secretgraphConfig')
    if (!result) {
        return null
    }
    return cleanConfig(JSON.parse(result))
}

export const loadConfig = async (
    obj: string | File | Storage = window.localStorage,
    pws?: string[]
): Promise<Interfaces.ConfigInterface | null> => {
    if (obj instanceof Storage) {
        return loadConfigSync(obj)
    } else if (obj instanceof File) {
        let parsedResult = JSON.parse(await obj.text())
        if (pws && parsedResult.data) {
            const parsedResult2: ArrayBuffer = (await decryptFirstPreKey({
                prekeys: parsedResult.prekeys,
                pws,
                hashAlgorithm: 'SHA-512',
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
                )
            )
        }
        return cleanConfig(parsedResult)
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
        const contentResult = await fetch(url, {
            headers: {
                Authorization: tokens.join(','),
            },
        })
        if (!contentResult.ok) {
            return null
        }
        let content = await contentResult.blob()
        // try unencrypted
        try {
            return cleanConfig(JSON.parse(await content.text()))
        } catch (ignore1) {}
        const nonce = contentResult.headers.get('X-NONCE')
        const key_hashes = []
        const raw_keys = new Set<ArrayBuffer>()
        if (!nonce || (prekeys.length && !pws?.length)) {
            throw Error('requires nonce and/or pws')
        }
        for (const key of keys) {
            const split = key.split(':', 2)
            if (split.length > 1 && split[1]) {
                raw_keys.add(Buffer.from(split[1], 'base64'))
                key_hashes.push(split[1])
            } else {
                raw_keys.add(Buffer.from(split[0], 'base64'))
            }
        }
        if (pws) {
            const pkeys = await decryptPreKeys({
                prekeys,
                pws,
                hashAlgorithm: 'SHA-512',
                iterations,
            })

            for (const pkey of pkeys) {
                pkey[1] && key_hashes.push(pkey[1])
                raw_keys.add(pkey[0])
            }
        }
        if (!raw_keys.size) {
            console.debug('no prekeys decrypted')
            return null
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
            return null
        }
        const keysResponse = await fetch(url, {
            headers: {
                Authorization: tokens.join(','),
                'X-KEY-HASH': key_hashes.join(','),
            },
        })
        if (!keysResponse.ok) {
            console.error('key response errored', keysResponse.statusText)
            return null
        }
        let keysResult
        // try walking the private key way
        try {
            keysResult = await keysResponse.json()
        } catch (exc) {
            console.error('Invalid response, expected json with keys', exc)
            return null
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
            try {
                return cleanConfig(JSON.parse(text))
            } catch (e) {
                console.warn('failed to parse config file', e)
                return null
            }
        } catch (exc) {
            console.warn('retrieving private keys failed: ', exc)
        }
        return null
    }
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

export async function exportConfigAsUrl({
    client,
    config,
    pw,
    iterations = 100000,
    types = ['direct', 'privatekey'],
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    pw?: string
    iterations: number
    types: ('direct' | 'privatekey')[]
}) {
    const authInfo = authInfoFromConfig({
        config,
        url: config.baseUrl,
        clusters: new Set([config.configCluster]),
        // only view action is allowed here as manage can do damage without decryption
        require: new Set(['view']),
        // only use token named config token
        search: 'config token',
    })
    const privcert: Uint8Array | null = authInfo.certificateHashes.length
        ? b64toarr(config.certificates[authInfo.certificateHashes[0]].data)
        : null

    if (!privcert) {
        return Promise.reject('no cert found')
    }
    const obj = await client.query({
        query: findConfigQuery,
        variables: {
            cluster: config.configCluster,
            authorization: authInfo.tokens,
            contentKeyHashes: authInfo.certificateHashes.map(
                (hash) => `key_hash=${hash}`
            ),
        },
    })
    for (const { node: configContent } of obj.data.secretgraph.contents.edges) {
        for (const {
            node: { target: pubkey, extra },
        } of configContent.references.edges) {
            const privkey = pubkey.referencedBy.edges[0]?.node?.source
            if (!privkey) {
                continue
            }
            const privkeykey = privkey.tags
                .find((tag: string) => tag.startsWith('key='))
                .match(/=(.*)/)[1]
            const url = new URL(config.baseUrl, window.location.href)
            // decrypt attached symmetric key
            const sharedKeyPrivateKey = await decryptRSAOEAP({
                key: privcert,
                data: privkeykey,
            })
            // shared key of config, test that everything is alright
            const sharedKeyConfig = await decryptRSAOEAP({
                key: sharedKeyPrivateKey.key,
                data: extra,
            })
            // clean url
            url.searchParams.delete('token')
            url.searchParams.delete('key')
            url.searchParams.delete('prekey')
            for (const token of authInfo.tokens) {
                url.searchParams.append('token', token)
            }
            if (pw) {
                url.pathname = configContent.link
                url.searchParams.set('iterations', `${iterations}`)
                if (types.includes('privatekey')) {
                    const prekeyPrivateKey = await encryptPreKey({
                        prekey: sharedKeyPrivateKey.data,
                        pw,
                        hashAlgorithm: 'SHA-512',
                        iterations,
                    })
                    url.searchParams.append(
                        'prekey',
                        `${authInfo.certificateHashes[0]}:${prekeyPrivateKey}`
                    )
                }

                if (types.includes('direct')) {
                    const prekeyConfig = await encryptPreKey({
                        prekey: sharedKeyConfig.data,
                        pw,
                        hashAlgorithm: 'SHA-512',
                        iterations,
                    })
                    url.pathname = configContent.link
                    for (const token of authInfo.tokens) {
                        url.searchParams.append('token', token)
                    }
                    url.searchParams.append(
                        'prekey',
                        `${configContent.id}:${prekeyConfig}`
                    )
                }

                return url.href
            } else {
                url.pathname = configContent.link
                for (const token of authInfo.tokens) {
                    url.searchParams.append('token', token)
                }
                if (types.includes('privatekey')) {
                    url.searchParams.append(
                        'key',
                        `${authInfo.certificateHashes[0]}:${Buffer.from(
                            sharedKeyPrivateKey.data
                        ).toString('base64')}`
                    )
                }

                if (types.includes('direct')) {
                    url.searchParams.append(
                        'key',
                        `${configContent.id}:${Buffer.from(
                            sharedKeyConfig.data
                        ).toString('base64')}`
                    )
                }

                return url.href
            }
        }
    }
    throw Error('no config content found')
}

export function authInfoFromConfig({
    config,
    url,
    require = new Set(['view', 'update', 'manage']),
    excludeClusters = new Set(),
    ...props
}: {
    readonly config: Interfaces.ConfigInterface
    readonly url: string
    readonly clusters?: Set<string>
    readonly excludeClusters?: Set<string>
    readonly contents?: Set<string>
    readonly require?: Set<string>
    readonly search?: string
}): Interfaces.AuthInfoInterface {
    const tokens = new Set<string>()
    const hashes = new Set<string>()
    const types = new Set<string>()
    const certificateHashes = new Set<string>()
    // TODO: remove other tokens if manage was found for exactly this content or cluster
    if (url === undefined || url === null) {
        throw Error(`no url: ${url}`)
    }
    const host = config.hosts[new URL(url, window.location.href).href]
    if (host) {
        if (!props.contents || props.clusters) {
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
    }

    // sorted is better for cache
    return {
        certificateHashes: [...certificateHashes].sort(),
        hashes: [...hashes].sort(),
        tokens: [...tokens].sort(),
        types,
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
    readonly hashAlgorithm: string
    old?: { [hash: string]: Promise<CryptoKey> }
}): { [hash: string]: Promise<CryptoKey> } {
    const privkeys = props.old || {}
    const urlob = new URL(url, window.location.href)
    const clusters = config.hosts[urlob.href].clusters
    for (const id in clusters) {
        if (props.clusters && !props.clusters.has(id)) {
            continue
        }
        const clusterconf = clusters[id]
        for (const hash in clusterconf.hashes) {
            if (config.certificates[hash] && !privkeys[hash]) {
                privkeys[hash] = unserializeToCryptoKey(
                    config.certificates[hash].data,
                    {
                        name: 'RSA-OAEP',
                        hash: Constants.mapHashNames[props.hashAlgorithm]
                            .operationName,
                    },
                    'privateKey'
                )
            }
        }
    }
    return privkeys
}

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
                        hashes.push({ hash: cleanhash, hashAlgorithm })
                    } else if (config.certificates[cleanhash]) {
                        hashes.push({
                            hash: cleanhash,
                            hashAlgorithm: undefined,
                        })
                    }
                }
            }
        }
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
            case 'certificates':
            case 'tokens':
                res = mergeDeleteObjects(newState[key], val)
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
                                    newval: Interfaces.ConfigClusterInterface<null>
                                ) => {
                                    count = 0
                                    const newState: Interfaces.ConfigClusterInterface =
                                        oldval
                                            ? Object.assign({}, oldval)
                                            : {
                                                  hashes: {},
                                              }
                                    if (newval.hashes) {
                                        const res = mergeDeleteObjects(
                                            newState.hashes,
                                            newval.hashes,
                                            // replace if not undefined, we have arrays
                                            (old, newobj) => {
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
                                    newval: Interfaces.ConfigContentInterface<null>
                                ) => {
                                    let count = 0
                                    const newState: Interfaces.ConfigContentInterface =
                                        oldval
                                            ? Object.assign({}, oldval)
                                            : {
                                                  hashes: {},
                                                  cluster: '',
                                              }
                                    if (newval.hashes) {
                                        const res = mergeDeleteObjects(
                                            newState.hashes,
                                            newval.hashes
                                        )
                                        newState.hashes = res[0]
                                        count += res[1]
                                    }
                                    if (newval.cluster) {
                                        newState.cluster = newval.cluster
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
    if (!ret) {
        throw Error('invalid merge')
    }
    return [ret, count]
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
        updateMap.set(hash, await serializeToBase64(unserializeToArrayBuffer(val).then((buf) => crypto.subtle.digest(
          mapHashNames[""+newHash].operationName, buf
        ))))
      }
      return [
        updateMap.get(hash),
        val
      ]
    }))),
    tokens: Object.fromEntries(await Promise.all(Object.entries(config.tokens).map(async([hash, val]) =>{
      let newHash = updateMap.get(hash);
      if (!updateMap.has(hash)){
        updateMap.set(hash, await serializeToBase64(unserializeToArrayBuffer(val).then((buf) => crypto.subtle.digest(
          mapHashNames[""+newHash].operationName, buf
        ))))
      }
      return [
        updateMap.get(hash),
        val
      ]
    })))
  }
  return ret
} */
