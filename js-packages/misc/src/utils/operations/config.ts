import { ApolloClient } from '@apollo/client'
import {
    findConfigQuery,
    updateConfigQuery,
} from '@secretgraph/graphql-queries/config'
import { getContentConfigurationQuery } from '@secretgraph/graphql-queries/content'
import { trustedKeysRetrieval } from '@secretgraph/graphql-queries/key'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'

import * as Constants from '../../constants'
import * as Interfaces from '../../interfaces'
import { UnpackPromise, ValueType } from '../../typing'
import { transformActions } from '../action'
import {
    authInfoFromConfig,
    cleanConfig,
    extractPrivKeys,
    updateConfig,
} from '../config'
import { b64toarr, utf8encoder } from '../encoding'
import {
    decryptRSAOEAP,
    encryptPreKey,
    unserializeToCryptoKey,
    verifySignature,
} from '../encryption'
import {
    calculateHashes,
    findWorkingHashAlgorithms,
    hashObject,
    hashTagsContentHash,
} from '../hashing'
import { fallback_fetch, retry } from '../misc'
import {
    createSignatureReferences,
    encryptSharedKey,
    extractGroupKeys,
    extractPubKeysClusterAndInjected,
    extractPubKeysReferences,
} from '../references'
import { createContent, decryptContentObject, updateContent } from './content'

export async function loadConfigFromSlot({
    client,
    slot,
    config,
}: {
    client: ApolloClient<any>
    slot: string
    config: Interfaces.ConfigInterface
}): Promise<Interfaces.ConfigInterface> {
    const authInfo = authInfoFromConfig({
        config,
        url: config.baseUrl,
        clusters: new Set([config.configCluster]),
        // only view action is allowed here as manage can do damage without decryption
        require: new Set(['view']),
        // only use token named config token
        searchToken: 'config token',
    })
    const configQueryRes = await client.query({
        query: findConfigQuery,
        variables: {
            cluster: config.configCluster,
            authorization: authInfo.tokens,
            configTags: [`slot=${slot}`],
        },
        // but why? should be updated by cache updates (for this no-cache is required in config content updates)
        fetchPolicy: 'network-only',
    })
    if (configQueryRes.errors) {
        throw configQueryRes.errors
    }
    let node = configQueryRes.data.secretgraph.contents.edges[0]?.node
    if (!node) {
        throw Error('could not find config object')
    }
    const retrieved = await decryptContentObject({
        nodeData: node,
        config,
        blobOrTokens: authInfo.tokens,
        itemDomain: config.baseUrl,
    })
    if (!retrieved) {
        throw Error('could not retrieve and decode config object')
    }
    const loadedConfig = cleanConfig(
        JSON.parse(String.fromCharCode(...new Uint8Array(retrieved.data)))
    )[0]
    if (!loadedConfig) {
        throw Error('Invalid config')
    }
    return loadedConfig
}

async function updateRemoteConfig({
    update,
    authInfo,
    client,
    slotHash,
    config,
    privkeys,
    pubkeys,
    node,
    hashAlgorithm,
}: {
    update: Interfaces.ConfigInputInterface
    client: ApolloClient<any>
    authInfo: Interfaces.AuthInfoInterface
    slotHash?: string
    node?: any
    config: Interfaces.ConfigInterface
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys: Parameters<typeof createSignatureReferences>[1]
    hashAlgorithm: string
}): Promise<[Interfaces.ConfigInterface, number] | false> {
    if (!node) {
        const configQueryRes = await client.query({
            query: findConfigQuery,
            variables: {
                cluster: config.configCluster,
                authorization: authInfo.tokens,
                configContentHashes: slotHash ? [slotHash] : undefined,
            },
            // but why? should be updated by cache updates (for this no-cache is required in config content updates)
            fetchPolicy: 'network-only',
        })
        if (configQueryRes.errors) {
            throw configQueryRes.errors
        }
        node = configQueryRes.data.secretgraph.contents.edges[0]?.node
        if (!node) {
            throw Error('could not find config object')
        }
    }
    const retrieved = await decryptContentObject({
        nodeData: node,
        config,
        blobOrTokens: authInfo.tokens,
        itemDomain: config.baseUrl,
    })
    if (!retrieved) {
        throw Error('could not retrieve and decode config object')
    }
    const foundConfig = JSON.parse(
        String.fromCharCode(...new Uint8Array(retrieved.data))
    )

    const [mergedConfig, changes] = updateConfig(foundConfig, update)
    if (changes == 0) {
        return [mergedConfig, changes]
    }
    // updates cache
    const result = await updateContent({
        client,
        id: node.id,
        updateId: node.updateId,
        privkeys: privkeys,
        pubkeys: pubkeys,
        tags: ['name=config.json', `slot=${mergedConfig.slots[0]}`],
        state: 'protected',
        hashAlgorithm,
        value: new Blob([JSON.stringify(mergedConfig)]),
        authorization: authInfo.tokens,
    })
    if (result.errors) {
        throw new Error(`Update failed: ${result.errors}`)
    }
    if (result.data.secretgraph.updateOrCreateContent.writeok) {
        return [mergedConfig, changes]
    }
    return false
}

export async function checkConfigObject(
    client: ApolloClient<any>,
    config: Interfaces.ConfigInterface,
    onlyMainHash: boolean = false
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
        if (!authInfo.certificateHashes.length) {
            console.error('No certificates found')
        }
        return false
    }

    const { data } = await client.query({
        query: findConfigQuery,
        variables: {
            configTags: [`slot=${config.slots[0]}`],
            cluster: config.configCluster,
            authorization: authInfo.tokens,
        },
    })
    const algos = findWorkingHashAlgorithms(
        data.secretgraph.config.hashAlgorithms
    )
    if (!data) {
        return false
    }
    const contentHashes = new Set(
        (
            await calculateHashes(
                utf8encoder.encode(`slot=${config.slots[0]}`),
                onlyMainHash ? [algos[0]] : algos
            )
        ).map((val) => `Config:${val}`)
    )
    const occurences = data.secretgraph.contents.edges.reduce(
        (prevValue: number, { node: curValue }: any) =>
            prevValue + (contentHashes.has(curValue.contentHash) ? 1 : 0),
        0
    )
    if (occurences == 0) {
        return false
    }
    if (occurences > 1) {
        console.error(
            'Too many config objects with the same slot found',
            data.secretgraph.contents.edges
        )
        return false
    }
    return true
}

export async function exportConfigAsUrl({
    client,
    config,
    pw,
    slot,
    iterations = 100000,
    types = ['direct', 'privatekey'],
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    slot: string
    pw?: string
    iterations?: number
    types?: ('direct' | 'privatekey')[]
}) {
    const authInfo = authInfoFromConfig({
        config,
        url: config.baseUrl,
        clusters: new Set([config.configCluster]),
        // only view action is allowed here as manage can do damage without decryption
        require: new Set(['view']),
        // only use token named config token
        searchToken: 'config token',
    })
    const privcert: Uint8Array | null = authInfo.certificateHashes.length
        ? b64toarr(config.certificates[authInfo.certificateHashes[0]].data)
        : null

    if (!privcert) {
        return Promise.reject('no cert found')
    }
    if (!config.slots.includes(slot)) {
        return Promise.reject('invalid slot')
    }
    const obj = await client.query({
        query: findConfigQuery,
        variables: {
            cluster: config.configCluster,
            authorization: authInfo.tokens,
            configTags: [`slot=${slot}`],
        },
    })
    for (const { node: configContent } of obj.data.secretgraph.contents
        .edges) {
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

export async function updateConfigRemoteReducer(
    state: Interfaces.ConfigInterface | null,
    {
        update,
        authInfo,
        client,
        nullonnoupdate,
        slots,
        excludeSlots,
        ignoreId,
    }: {
        update: Interfaces.ConfigInputInterface | null
        client: ApolloClient<any>
        authInfo?: Interfaces.AuthInfoInterface
        nullonnoupdate?: boolean
        slots?: Iterable<string>
        excludeSlots?: Set<string>
        // allow updating config objects with updateOrCreateContentWithConfig
        ignoreId?: string
    }
): Promise<Interfaces.ConfigInterface | null> {
    if (update === null) {
        // protect config update against null
        return null
    }
    const resconf = updateConfig(state, update)
    if (nullonnoupdate && resconf[1] == 0) {
        return null
    }
    if (!authInfo) {
        authInfo = authInfoFromConfig({
            config: resconf[0],
            url: resconf[0].baseUrl,
            clusters: new Set([resconf[0].configCluster]),
            require: new Set(['update', 'manage']),
        })
    }
    const serverConfigRes = await client.query({
        query: serverConfigQuery,
        fetchPolicy: 'cache-first',
    })
    const hashAlgorithms = findWorkingHashAlgorithms(
        serverConfigRes.data.secretgraph.config.hashAlgorithms
    )
    let slotPre = [...(slots ? slots : resconf[0].slots)]
    if (excludeSlots) {
        slotPre = slotPre.filter((slot: string) => !excludeSlots.has(slot))
    }
    // TODO: fix implementation to handle that case
    const maxRelayResults: number =
        serverConfigRes.data.secretgraph.config.maxRelayResults
    if (slotPre.length > maxRelayResults) {
        console.warn(
            `Too many slots specified, max: ${maxRelayResults}. Cutoff results to maxRelayResults`
        )
        slotPre = slotPre.slice(0, maxRelayResults)
    }
    const slotHashes = await Promise.all(
        slotPre.map((slot: string) =>
            hashTagsContentHash([`slot=${slot}`], 'Config', hashAlgorithms[0])
        )
    )
    if (!authInfo.tokens.length) {
        throw Error('No auth tokens found, not possible to continue')
    }

    const configQueryRes = await client.query({
        query: updateConfigQuery,
        variables: {
            cluster: resconf[0].configCluster,
            authorization: authInfo.tokens,
            configContentHashes: slotHashes,
        },
        // but why? should be updated by cache updates (for this no-cache is required in config content updates)
        fetchPolicy: 'network-only',
    })
    if (configQueryRes.errors) {
        throw configQueryRes.errors
    }
    let nodes: { node: any }[] = configQueryRes.data.secretgraph.contents.edges
    let mainNodeIndex = nodes.findIndex(
        ({ node }) => node.contentHash == slotHashes[0]
    )
    if (mainNodeIndex < 0) {
        console.debug(
            'Main not found, hash algorithm updated? Initialize upgrade routine'
        )
        const contentHashes = new Set(
            (
                await calculateHashes(
                    utf8encoder.encode(`slot=${slotPre[0]}`),
                    hashAlgorithms
                )
            ).map((val) => `Config:${val}`)
        )
        const configQueryRes = await client.query({
            query: updateConfigQuery,
            variables: {
                cluster: resconf[0].configCluster,
                authorization: authInfo.tokens,
                configContentHashes: [...contentHashes],
                configTags: slotPre
                    .slice(1)
                    .map((slot: string) => `slot=${slot}`),
            },
            // but why? should be updated by cache updates (for this no-cache is required in config content updates)
            fetchPolicy: 'network-only',
        })
        if (configQueryRes.errors) {
            throw configQueryRes.errors
        }
        nodes = configQueryRes.data.secretgraph.contents.edges
        mainNodeIndex = nodes.findIndex(({ node }) =>
            contentHashes.has(node.contentHash)
        )
    }

    if (mainNodeIndex < 0) {
        throw Error('could not find main config object')
    }

    const privkeys = extractPrivKeys({
        config: resconf[0],
        url: resconf[0].baseUrl,
        hashAlgorithm: hashAlgorithms[0],
        onlySignKeys: true,
    })

    const privkeysSign = Object.values(privkeys)
    //
    const pubkeys = Object.values(
        extractPubKeysReferences({
            node: nodes[mainNodeIndex].node,
            source: privkeys,
            onlySeen: true,
            authorization: authInfo.tokens,
            hashAlgorithm: hashAlgorithms[0],
            itemDomain: resconf[0].baseUrl,
        })
    )
    let resultPromises = []
    const slotUpdate: Interfaces.ConfigInputInterface = {}
    let slotUpdateEmpty = true
    for (const key of Object.keys(update)) {
        if (!Constants.privateConfigKeys.has(key)) {
            ;(slotUpdate as any)[key] = (update as any)[key]
            slotUpdateEmpty = false
        }
    }
    for (let index = 0; index < nodes.length; index++) {
        let node = nodes[index].node
        if (
            (ignoreId && ignoreId == node.id) ||
            (slotUpdateEmpty && index == mainNodeIndex)
        ) {
            resultPromises.push(Promise.resolve<[null, number]>([null, 0]))
            continue
        }
        resultPromises.push(
            retry({
                action: async (attempted: number) => {
                    let result = await updateRemoteConfig({
                        update: index == mainNodeIndex ? update : slotUpdate,
                        config: resconf[0],
                        authInfo: authInfo as Interfaces.AuthInfoInterface,
                        client,
                        privkeys: privkeysSign,
                        pubkeys,
                        hashAlgorithm: hashAlgorithms[0],
                        slotHash: node.contentHash,
                        node: attempted == 0 ? node : undefined,
                    })
                    if (result === false) {
                        throw new Error('retry')
                    }
                    return result
                },
            })
        )
    }
    const results = await Promise.allSettled(resultPromises)
    await client.refetchQueries({})
    let mainResult = results[mainNodeIndex]
    if (mainResult.status == 'fulfilled') {
        return mainResult.value[0]
    } else {
        throw mainResult.reason
    }
}

interface updateOrCreateContentWithConfigSharedParams {
    itemClient: ApolloClient<any>
    baseClient: ApolloClient<any>
    url: string
    config: Interfaces.ConfigInterface
    mapper?: Parameters<typeof transformActions>[0]['mapper']
    cluster: string
    state: string
    actions: Parameters<typeof transformActions>[0]['actions']
    hashAlgorithm: string
    authorization: string[]
    validFor?: string
    groupKeys?: {
        [name: string]: { [hash: string]: Promise<CryptoKey> }
    }
}

type updateOrCreateContentWithConfigReplacedParams =
    | 'client'
    | 'pubkeys'
    | 'privkeys'
    | keyof updateOrCreateContentWithConfigSharedParams

type updateOrCreateContentWithConfigParams = Omit<
    | (Parameters<typeof updateContent>[0] & {
          type?: string
      })
    | (Parameters<typeof createContent>[0] & {
          id?: string
          updateId?: string
      }),
    updateOrCreateContentWithConfigReplacedParams
> &
    updateOrCreateContentWithConfigSharedParams

/**
 * Helper function implementing the whole content update/create workflow
 * TODO: typings could be better
 */
export async function updateOrCreateContentWithConfig({
    itemClient,
    baseClient,
    net,
    config,
    cluster,
    hashAlgorithm,
    url,
    authorization,
    actions,
    mapper,
    state,
    type,
    id,
    updateId,
    value,
    groupKeys,
    validFor,
    ...options
}: updateOrCreateContentWithConfigParams): Promise<
    | {
          config: Interfaces.ConfigInterface | null
          configUpdate: Interfaces.ConfigInputInterface | null
          node: any
          writeok: boolean
          configok: boolean
      }
    | false
> {
    const host = config.hosts[url]

    const content_key_or_token_hashes = new Set<string>(
        (id &&
            host?.contents[id]?.hashes &&
            Object.keys(host.contents[id].hashes)) ||
            []
    )
    const cluster_key_or_token_hashes = new Set(
        Object.keys(host?.clusters[cluster] || [])
    )
    const _privkeys = extractPrivKeys({
        config,
        url,
        hashAlgorithm,
        clusters: new Set([cluster]),
        onlySignKeys: true,
    })
    let pubkeys: { [hash: string]: Promise<CryptoKey> } = {}
    if (state != 'public') {
        // TODO: fetchMore and evaluate fetchPolicy
        const pubkeysResult = await itemClient.query({
            fetchPolicy: 'network-only',
            query: getContentConfigurationQuery,
            variables: {
                authorization,
                id: cluster,
            },
        })
        if (!groupKeys) {
            groupKeys = await extractGroupKeys({
                serverConfig: pubkeysResult.data.secretgraph.config,
                hashAlgorithm,
                itemDomain: url,
            })
        }

        pubkeys = extractPubKeysClusterAndInjected({
            node: pubkeysResult.data.secretgraph.node,
            authorization,
            hashAlgorithm: hashAlgorithm,
            groupKeys,
            itemDomain: url,
        })
    }
    const privkeys = await Promise.all(Object.values(_privkeys))
    const {
        hashes,
        actions: finishedActions,
        configUpdate,
    } = await transformActions({
        actions,
        mapper,
        config,
        hashAlgorithm,
        signKeys: privkeys,
        validFor,
    })

    let result
    try {
        const noptions = {
            client: itemClient,
            config,
            cluster,
            privkeys,
            pubkeys: Object.values(pubkeys),
            hashAlgorithm,
            actions: finishedActions,
            authorization,
            state,
        }
        if (id) {
            result = await updateContent({
                ...noptions,
                ...options,
                value,
                id,
                updateId: updateId as string,
            })
        } else {
            result = await createContent({
                ...noptions,
                ...(options as Required<typeof options>),
                value: value as NonNullable<typeof value>,
                type: type as string,
            })
        }
        if (!result.data.secretgraph.updateOrCreateContent.writeok) {
            return {
                config: null,
                configUpdate: null,
                node: result.data.secretgraph.updateOrCreateContent.content,
                writeok: false,
                configok: false,
            }
        }
    } catch (exc) {
        console.error('updating/creating content failed', exc)
        return false
    }
    try {
        const hashesNew: any = {}
        for (const entry of Object.entries(hashes)) {
            if (
                content_key_or_token_hashes.has(entry[0]) ||
                !cluster_key_or_token_hashes.has(entry[0])
            ) {
                hashesNew[entry[0]] = entry[1]
            }
        }
        configUpdate.hosts[url] = {
            contents: {
                [result.data.secretgraph.updateOrCreateContent.content.id]: {
                    hashes: hashesNew,
                    cluster,
                },
            },
            clusters: {},
        }
        return {
            config: await updateConfigRemoteReducer(config, {
                update: configUpdate,
                client: baseClient,
                nullonnoupdate: true,
                // allow updating config objects with updateOrCreateContentWithConfig
                ignoreId:
                    result.data.secretgraph.updateOrCreateContent.content.id,
            }),
            node: result.data.secretgraph.updateOrCreateContent.content,
            writeok: true,
            configok: true,
            configUpdate,
        }
    } catch (exc) {
        console.error('updating config failed', exc)
        return {
            config: null,
            node: result.data.secretgraph.updateOrCreateContent.content,
            writeok: true,
            configok: false,
            configUpdate,
        }
    }
}

async function updateTrust({
    map,
    itemDomain,
    linksToHash,
}: {
    map: {
        [key: string]:
            | (ValueType<Interfaces.ConfigInterface['trustedKeys']> & {
                  nodes: any[]
                  blob: Blob
                  key: CryptoKey
              })
            | null
    }
    linksToHash: { [link: string]: string }
    itemDomain?: string
}) {
    let currentLevel = 1
    let hadUpdate: boolean = true
    let keys = new Set(Object.keys(map))
    while (hadUpdate) {
        hadUpdate = false
        for (const key of [...keys]) {
            const value = map[key]
            if (!value) {
                keys.delete(key)
                continue
            }
            if (value.level == currentLevel) {
                keys.delete(key)
                for (const keynode of value.nodes) {
                    for (const { node } of keynode.referencedBy.edges) {
                        const source = node.source
                        const signature = node.signature
                        const sourceLink = new URL(source.link, itemDomain)
                            .href
                        let foundHash = linksToHash[sourceLink]
                        if (!foundHash) {
                            continue
                        }
                        const sourceOb = map[foundHash]
                        if (sourceOb && sourceOb.level > 2) {
                            try {
                                if (
                                    await verifySignature(
                                        value.key,
                                        signature,
                                        sourceOb.blob
                                    )
                                ) {
                                    sourceOb.level = 2
                                    hadUpdate = true
                                }
                            } catch (exc) {
                                console.debug('Bad signature:', exc)
                            }
                        }
                    }
                }
            }
        }
        currentLevel = 2
    }
}

export async function updateTrustedKeys({
    config,
    itemClient,
    baseClient,
    itemDomain,
    authorization,
    hashAlgorithm,
    clusters,
    states = ['trusted', 'required'],
    signWithIsTrusted = 'all',
}: {
    itemClient: ApolloClient<any>
    baseClient: ApolloClient<any>
    itemDomain?: string
    config: Interfaces.ConfigInterface
    clusters: string
    hashAlgorithm: string
    authorization: string[]
    states?: string[]
    signWithIsTrusted?: false | 'first' | 'all'
}) {
    const signWithKeyHashes = new Set<string>()
    if (signWithIsTrusted) {
        if (signWithIsTrusted == 'first') {
            for (const hash of config.signWith[config.slots[0]] || []) {
                signWithKeyHashes.add(hash)
            }
        } else {
            for (const val of Object.values(config.signWith)) {
                for (const hash of val) {
                    signWithKeyHashes.add(hash)
                }
            }
        }
    }
    const { data } = await itemClient.query({
        query: trustedKeysRetrieval,
        variables: {
            clusters,
            authorization,
            states,
        },
        fetchPolicy: 'network-only',
    })

    const trustedKeysWithNodes: {
        [key: string]:
            | (ValueType<Interfaces.ConfigInterface['trustedKeys']> & {
                  nodes: any[]
                  blob: Blob
                  key: CryptoKey
              })
            | null
    } = {}
    const linksToHash: { [link: string]: string } = {}

    let ops: Promise<any>[] = []

    for (const { node } of data.secretgraph.contents.edges) {
        const fn = async () => {
            const link = new URL(node.link, itemDomain)
            const response = await fetch(link, {
                credentials: 'omit',
                mode: 'no-cors',
                cache: 'no-cache',
            })
            if (!response.ok) {
                return
            }
            if (response.headers.get('X-TYPE') != 'PublicKey') {
                await response.body?.cancel()
                return
            }
            const keyBlob = await response.blob()
            const hash = await hashObject(keyBlob, hashAlgorithm)
            if (trustedKeysWithNodes[hash]) {
                // duplicate and not null
                if (
                    !Constants.trusted_states.has(
                        '' + response.headers.get('X-STATE')
                    )
                ) {
                    trustedKeysWithNodes[hash]!.links.push(link.href)
                    trustedKeysWithNodes[hash]!.nodes.push(node)
                }
                return
            }
            if (config.trustedKeys[hash]) {
                if (
                    !Constants.trusted_states.has(
                        '' + response.headers.get('X-STATE')
                    )
                ) {
                    trustedKeysWithNodes[hash] = null
                } else {
                    linksToHash[link.href] = hash
                    let level = config.trustedKeys[hash].level
                    if (signWithIsTrusted && signWithKeyHashes.has(hash)) {
                        level = 1
                    }
                    trustedKeysWithNodes[hash] = {
                        ...config.trustedKeys[hash],
                        level,
                        key: await unserializeToCryptoKey(
                            keyBlob,
                            'publickey'
                        ),
                        blob: keyBlob,
                        nodes: [node],
                        links: [...config.trustedKeys[hash].links, link.href],
                        lastChecked: Math.floor(Date.now() / 1000),
                    }
                }
            } else if (
                Constants.trusted_states.has(
                    '' + response.headers.get('X-STATE')
                )
            ) {
                linksToHash[link.href] = hash
                let level: 1 | 2 | 3 = 3
                if (signWithIsTrusted && signWithKeyHashes.has(hash)) {
                    level = 1
                }
                trustedKeysWithNodes[hash] = {
                    level,
                    note: '',
                    key: await unserializeToCryptoKey(keyBlob, 'publickey'),
                    blob: keyBlob,
                    nodes: [node],
                    links: [link.href],
                    lastChecked: Math.floor(Date.now() / 1000),
                }
            }
        }
        ops.push(fn())
    }
    await Promise.all(ops)
    await updateTrust({ map: trustedKeysWithNodes, itemDomain, linksToHash })

    const trustedKeys: Interfaces.ConfigInputInterface['trustedKeys'] = {}

    for (const [key, value] of Object.entries(trustedKeysWithNodes)) {
        const fn = async () => {
            if (value === null) {
                trustedKeys[key] = value
                return
            }
            if (value.level <= 2) {
                trustedKeys[key] = {
                    level: value.level,
                    note: value.note,
                    links: value.links,
                    lastChecked: value.lastChecked,
                }
                return
            }
            trustedKeys[key] = null
        }
        ops.push(fn())
    }
    await Promise.all(ops)

    return await updateConfigRemoteReducer(config, {
        update: {
            trustedKeys,
        },
        client: baseClient,
    })
}
