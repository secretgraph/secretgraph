import { ApolloClient } from '@apollo/client'
import { saveAs } from 'file-saver'

import * as Constants from '../constants'
import * as Interfaces from '../interfaces'
import { findConfigQuery } from '../queries/content'
import {
    decryptAESGCM,
    decryptFirstPreKey,
    decryptRSAOEAP,
    encryptAESGCM,
    encryptPreKey,
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
    let actions: string[] = [],
        cert: Uint8Array | null = null
    if (!actions || !cert) {
        return false
    }
    const tokens = actions.map((action) => `${config.configCluster}:${action}`)
    const result = await client.query({
        query: findConfigQuery,
        variables: {
            cluster: config.configCluster,
            authorization: tokens,
        },
    })
    if (!result || result.data.contents.edges.length < 1) {
        return false
    }
    if (result.data.contents.edges.length > 1) {
        console.error(
            'Too many config objects found',
            result.data.contents.edges
        )
        return false
    }
    return true
}

export const loadConfigSync = (
    obj: Storage = window.localStorage
): Interfaces.ConfigInterface | null => {
    let result = obj.getItem('secretgraphConfig')
    if (!result) {
        return null
    }
    return cleanConfig(JSON.parse(result))
}

export const loadConfig = async (
    obj: string | File | Request | Storage = window.localStorage,
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
        let request: Request
        if (obj instanceof Request) {
            request = obj
        } else {
            request = new Request(obj)
        }
        const contentResult = await fetch(request)
        if (!contentResult.ok) {
            return null
        }
        const decrypturl = new URL(request.url, window.location.href)
        const prekeys = decrypturl.searchParams.getAll('prekey')
        decrypturl.searchParams.delete('prekey')
        if (pws) {
            decrypturl.searchParams.set('keys', '')
            const decryptResult = await fetch(
                new Request(decrypturl.toString(), {
                    headers: request.headers,
                })
            )
            decrypturl.searchParams.delete('keys')
            if (!decryptResult.ok || !contentResult.headers.get('X-NONCE')) {
                return null
            }
            const keyArr = await new Promise<[CryptoKey, Uint8Array, string]>(
                async (resolve, reject) => {
                    const queries = []
                    // support only one page
                    const page = await decryptResult.json()
                    for (const k of page.keys) {
                        if (!k.link) {
                            continue
                        }
                        decrypturl.pathname = k.link
                        queries.push(
                            fetch(
                                new Request(decrypturl.toString(), {
                                    headers: request.headers,
                                })
                            ).then(async (response) => {
                                if (
                                    !response.ok ||
                                    !response.headers.get('X-NONCE') ||
                                    !response.headers.get('X-ITERATIONS')
                                ) {
                                    return
                                }
                                const nonce = b64toarr(
                                    response.headers.get('X-NONCE') as string
                                )
                                const respdata = await response.arrayBuffer()
                                for (const iterations of (response.headers.get(
                                    'X-ITERATIONS'
                                ) as string).split(',')) {
                                    try {
                                        return await decryptFirstPreKey({
                                            prekeys,
                                            pws,
                                            hashAlgorithm: 'SHA-512',
                                            iterations,
                                            fn: async (
                                                data: [
                                                    ArrayBuffer,
                                                    string | null
                                                ]
                                            ) => {
                                                if (data[1]) {
                                                    return Promise.reject(
                                                        'not for decryption'
                                                    )
                                                }
                                                return await decryptAESGCM({
                                                    key: data[0],
                                                    nonce: nonce,
                                                    data: respdata,
                                                }).then((data) =>
                                                    resolve([
                                                        data.key,
                                                        nonce,
                                                        k.extra,
                                                    ])
                                                )
                                            },
                                        })
                                    } finally {
                                    }
                                }
                            })
                        )
                    }
                    await Promise.allSettled(queries)
                    reject()
                }
            )
            const sharedKey = await decryptAESGCM({
                key: keyArr[0],
                nonce: keyArr[1],
                data: keyArr[2],
            })
            const config = await decryptAESGCM({
                key: sharedKey.data,
                nonce: b64toarr(contentResult.headers.get('X-NONCE') as string),
                data: contentResult.arrayBuffer(),
            }).then((data) =>
                cleanConfig(
                    JSON.parse(
                        String.fromCharCode(...new Uint8Array(data.data))
                    )
                )
            )
            return cleanConfig(config)
        } else if (prekeys) {
            throw 'requires pw but not specified'
        }
        try {
            return cleanConfig(await contentResult.json())
        } catch (e) {
            console.warn(e)
            return null
        }
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
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    iterations: number
    pw?: string
}) {
    const authInfo = extractAuthInfo({
        config,
        url: config.baseUrl,
        clusters: new Set([config.configCluster]),
    })
    const cert: Uint8Array | null = authInfo.certificateHashes.length
        ? b64toarr(config.certificates[authInfo.certificateHashes[0]].data)
        : null

    const obj = await client.query({
        query: findConfigQuery,
        variables: {
            cluster: config.configCluster,
            authorization: authInfo.tokens,
        },
    })
    let certhashes: string[] = []
    if (!cert) {
        return Promise.reject('no cert found')
    }
    certhashes = await Promise.all(
        obj.data.secretgraph.config.hashAlgorithms.map((hash: string) =>
            crypto.subtle
                .digest(
                    Constants.mapHashNames[hash].operationName,
                    cert as Uint8Array
                )
                .then((data) =>
                    btoa(String.fromCharCode(...new Uint8Array(data)))
                )
        )
    )
    const searchcerthashes = new Set(
        authInfo.hashes.map((hash) => `key_hash=${hash}`)
    )
    for (const { node: configContent } of obj.data.contents.edges) {
        if (!configContent.tags.includes('type=Config')) {
            continue
        }
        for (const { node: keyref } of configContent.references.edges) {
            if (
                keyref.target.tags.findIndex((val: any) =>
                    searchcerthashes.has(val)
                ) == -1
            ) {
                continue
            }
            const privkeyrefnode = keyref.target.references.find(
                ({ node }: any) => node.target.tags
            )
            if (!privkeyrefnode) {
                continue
            }
            const privkeykey = privkeyrefnode.node.target.tags
                .find((tag: string) => tag.startsWith('key='))
                .match(/=(.*)/)[1]
            const url = new URL(config.baseUrl, window.location.href)
            const sharedKeyPrivateKeyRes = await decryptRSAOEAP({
                key: cert,
                data: privkeykey,
            })
            if (pw) {
                const sharedKeyConfigRes = decryptRSAOEAP({
                    key: sharedKeyPrivateKeyRes.key,
                    data: keyref.extra,
                })
                const prekey = await encryptPreKey({
                    prekey: sharedKeyPrivateKeyRes.data,
                    pw,
                    hashAlgorithm: 'SHA-512',
                    iterations,
                })
                const prekey2 = await encryptPreKey({
                    prekey: (await sharedKeyConfigRes).data,
                    pw,
                    hashAlgorithm: 'SHA-512',
                    iterations,
                })
                return `${url.origin}${
                    configContent.link
                }?decrypt&token=${authInfo.tokens.join('token=')}&prekey=${
                    certhashes[0]
                }:${prekey}&prekey=shared:${prekey2}`
            } else {
                return `${url.origin}${
                    configContent.link
                }?decrypt&token=${authInfo.tokens.join('token=')}&token=${
                    certhashes[0]
                }:${btoa(
                    String.fromCharCode(
                        ...new Uint8Array(sharedKeyPrivateKeyRes.data)
                    )
                )}`
            }
        }
    }
    throw Error('no config content found')
}

export function extractAuthInfo({
    config,
    url,
    require = new Set(['view', 'update', 'manage']),
    ...props
}: {
    readonly config: Interfaces.ConfigInterface
    readonly url: string
    readonly clusters?: Set<string>
    readonly content?: string
    readonly require?: Set<string>
}): Interfaces.AuthInfoInterface {
    const keys = new Set<string>()
    const hashes = new Set<string>()
    const certificateHashes = new Set<string>()
    if (url === undefined || url === null) {
        throw Error(`no url: ${url}`)
    }
    const host = config.hosts[new URL(url, window.location.href).href]
    if (host && (!props.content || props.clusters)) {
        for (const id in host.clusters) {
            if (props.clusters && !props.clusters.has(id)) {
                continue
            }
            const clusterconf = host.clusters[id]
            for (const hash in clusterconf.hashes) {
                if (
                    config.tokens[hash] &&
                    SetOps.hasIntersection(require, clusterconf.hashes[hash])
                ) {
                    hashes.add(hash)
                    keys.add(`${id}:${config.tokens[hash]?.data}`)
                }
                if (config.certificates[hash]) {
                    certificateHashes.add(hash)
                }
            }
        }
    }
    if (host && props.content) {
        const contentconf = host.contents[props.content]
        for (const hash in contentconf.hashes) {
            if (config.certificates[hash]) {
                certificateHashes.add(hash)
            } else if (
                config.tokens[hash] &&
                SetOps.hasIntersection(require, contentconf.hashes[hash])
            ) {
                if (!config.tokens[hash] || !hash) {
                    console.warn('token not found for:', hash)
                }
                hashes.add(hash)
                keys.add(`${contentconf.cluster}:${config.tokens[hash]?.data}`)
            }
        }
    }
    // sorted is better for cache
    return {
        certificateHashes: [...certificateHashes].sort(),
        hashes: [...hashes].sort(),
        tokens: [...keys].sort(),
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
                        hash:
                            Constants.mapHashNames[props.hashAlgorithm]
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
    if (nodeData.tags.includes('type=PrivateKey')) {
        const hashes = []
        for (const tag of nodeData.tags) {
            if (tag.startsWith('key_hash=')) {
                const [_, hashAlgorithm, cleanhash] = tag.match(
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
        for (const tag of nodeData.tags) {
            if (tag.startsWith('key=')) {
                for (const { hash, hashAlgorithm } of hashes) {
                    const [_, hashAlgorithm2, shared] = tag.match(
                        /=(?:([^:]*?):)?([^:]*)/
                    )
                    found.push({
                        hash,
                        hashAlgorithm: hashAlgorithm2 || hashAlgorithm,
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
        for (const dirtyhash of refnode.target.tags) {
            const [_, hashAlgorithm, cleanhash] = dirtyhash.match(
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

export function updateConfigReducer(
    state: Interfaces.ConfigInterface | null,
    update: Interfaces.ConfigInputInterface,
    replace?: boolean
): Interfaces.ConfigInterface
export function updateConfigReducer(
    state: Interfaces.ConfigInterface | null,
    update: Interfaces.ConfigInputInterface | null,
    replace?: boolean
): Interfaces.ConfigInterface | null
export function updateConfigReducer(
    state: Interfaces.ConfigInterface | null,
    update: Interfaces.ConfigInputInterface | null,
    replace?: boolean
): Interfaces.ConfigInterface | null {
    if (update === null) {
        return null
    }
    if (replace) {
        return update as Interfaces.ConfigInterface
    }
    const newState: Interfaces.ConfigInterface = Object.create(state || {})
    if (update.certificates) {
        newState.certificates = mergeDeleteObjects(
            newState.certificates,
            update.certificates
        )
    }
    if (update.tokens) {
        newState.tokens = mergeDeleteObjects(newState.tokens, update.tokens)
    }
    if (update.baseUrl) {
        newState.baseUrl = update.baseUrl
    }
    if (update.configCluster) {
        newState.configCluster = update.configCluster
    }
    if (update.hosts) {
        newState.hosts = mergeDeleteObjects(
            newState.hosts,
            update.hosts,
            (oldval: any, newval: any) => {
                const newState = Object.create(oldval || {})
                if (newval.hashAlgorithms) {
                    newState.hashAlgorithms = newval.hashAlgorithms
                }
                if (newval.clusters) {
                    newState.clusters = mergeDeleteObjects(
                        newState.clusters,
                        newval.clusters
                    )
                }
                if (newval.contents) {
                    newState.contents = mergeDeleteObjects(
                        newState.contents,
                        newval.contents
                    )
                }
                return newState
            }
        )
    }
    return newState
}

const actionMatcher = /:(.*)/

export type ActionMapperEntry = {
    newHash: string
    oldHash: null | string
    note: string
    token: string
    configActions: Set<string>
    foundActions: Set<string>
}

export type CertificateEntry = {
    newHash: string
    oldHash: string
    note: string
}

export async function calculateActionMapper({
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
    unknownKeyhashes?: string[]
    unknownTokens: string[]
    hashAlgorithm: string
}) {
    const prepareActions: PromiseLike<ActionMapperEntry | null>[] = []
    const premapper: {
        [hash: string]: Set<string>
    } = {}
    for (const entry of nodeData?.availableActions || []) {
        if (!premapper[entry.keyHash]) {
            premapper[entry.keyHash] = new Set()
        }
        premapper[entry.keyHash].add(entry.type)
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
                    foundActions: premapper[val] || new Set(),
                }
            })
        )
    }
    for (const [hash, actions] of Object.entries(knownHashes || {})) {
        if (config.tokens[hash]) {
            prepareActions.push(
                serializeToBase64(
                    unserializeToArrayBuffer(
                        config.tokens[hash].data
                    ).then((val) => crypto.subtle.digest(hashalgo, val))
                ).then((val) => {
                    return {
                        newHash: val,
                        oldHash: hash,
                        note: config.tokens[hash].note,
                        token: config.tokens[hash].data,
                        configActions: new Set<string>(actions),
                        foundActions: premapper[val] || new Set(),
                    }
                })
            )
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
