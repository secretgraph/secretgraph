import { ApolloClient } from '@apollo/client'
import {
    findConfigQuery,
    updateConfigQuery,
} from '@secretgraph/graphql-queries/config'
import { getContentConfigurationQuery } from '@secretgraph/graphql-queries/content'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'

import * as Constants from '../../constants'
import * as Interfaces from '../../interfaces'
import { UnpackPromise } from '../../typing'
import { transformActions } from '../action'
import {
    authInfoFromConfig,
    cleanConfig,
    extractPrivKeys,
    updateConfig,
} from '../config'
import { b64toarr, serializeToBase64, utf8encoder } from '../encoding'
import {
    decryptAESGCM,
    decryptFirstPreKey,
    decryptPreKeys,
    decryptRSAOEAP,
    encryptAESGCM,
    encryptPreKey,
} from '../encryption'
import { findWorkingHashAlgorithms, hashTagsContentHash } from '../hashing'
import { retry } from '../misc'
import {
    createSignatureReferences,
    encryptSharedKey,
    extractPubKeysCluster,
} from '../references'
import { createContent, decryptContentObject, updateContent } from './content'

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
    privkeys: Parameters<typeof encryptSharedKey>[1]
    pubkeys: Parameters<typeof createSignatureReferences>[1]
    hashAlgorithm: string
}): Promise<[Interfaces.ConfigInterface, number] | false> {
    if (!node) {
        const configQueryRes = await client.query({
            query: findConfigQuery,
            variables: {
                cluster: config.configCluster,
                authorization: authInfo.tokens,
                configContentHashes: [slotHash],
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
        baseUrl: config.baseUrl,
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
        state: 'protected',
        config: mergedConfig,
        hashAlgorithm,
        value: new Blob([JSON.stringify(mergedConfig)]),
        authorization: authInfo.tokens,
    })
    if (result.errors) {
        throw new Error(`Update failed: ${result.errors}`)
    }
    if (result.data.updateOrCreateContent.writeok) {
        return [mergedConfig, changes]
    }
    return false
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
    const algos = findWorkingHashAlgorithms(
        data.secretgraph.config.hashAlgorithms
    )
    const contentHash = hashTagsContentHash(
        [`slot=${config}`],
        'Config',
        algos[0]
    )
    if (!data) {
        return false
    }
    const occurences = data.secretgraph.contents.edges.reduce(
        (prevValue: number, { node: curValue }: any) =>
            prevValue + curValue.contentHash == contentHash ? 1 : 0,
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
    const contentHash = await hashTagsContentHash(
        [`slot=${config.slots[0]}`],
        'Config',
        authInfo.certificateHashes[0].split(':', 1)[0]
    )
    const obj = await client.query({
        query: findConfigQuery,
        variables: {
            cluster: config.configCluster,
            authorization: authInfo.tokens,
            configContentHashes: [contentHash],
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

export async function updateConfigRemoteReducer(
    state: Interfaces.ConfigInterface | null,
    {
        update,
        authInfo,
        client,
        nullonnoupdate,
        slots,
        excludeSlots,
    }: {
        update: Interfaces.ConfigInputInterface | null
        client: ApolloClient<any>
        authInfo?: Interfaces.AuthInfoInterface
        nullonnoupdate?: boolean
        slots?: Iterable<string>
        excludeSlots?: Set<string>
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
    const algos = findWorkingHashAlgorithms(
        serverConfigRes.data.secretgraph.config.hashAlgorithms
    )

    let slotHashes = [...(slots ? slots : resconf[0].slots)]
    if (excludeSlots) {
        slotHashes = slotHashes.filter(
            (slot: string) => !excludeSlots.has(slot)
        )
    }
    // TODO: fix implementation to handle that case
    const maxRelayResults: number =
        serverConfigRes.data.secretgraph.config.maxRelayResults
    if (slotHashes.length > maxRelayResults) {
        console.warn(
            `Too many slots specified, max: ${maxRelayResults}. Cutoff results to maxRelayResults`
        )
        slotHashes = slotHashes.slice(0, maxRelayResults)
    }
    slotHashes = await Promise.all(
        slotHashes.map((slot: string) =>
            hashTagsContentHash([`slot=${slot}`], 'Config', algos[0])
        )
    )
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
    const nodes: any[] = configQueryRes.data.secretgraph.contents.edges
    const mainNodeIndex = nodes.findIndex(
        (result, index) => nodes[index].node.contentHash == slotHashes[0]
    )
    if (mainNodeIndex < 0) {
        throw Error('could not find main config object')
    }

    const privkeys = extractPrivKeys({
        config: resconf[0],
        url: resconf[0].baseUrl,
        hashAlgorithm: algos[0],
        onlySignKeys: true,
    })

    const privkeysSign = Object.values(privkeys)
    //
    const pubkeys = Object.values(
        extractPubKeysCluster({
            node: nodes[mainNodeIndex],
            source: privkeys,
            onlySeen: true,
            authorization: authInfo.tokens,
            params: {
                name: 'RSA-OAEP',
                hash: algos[0],
            },
        })
    )
    let resultPromises = []
    for (let { node } of nodes) {
        resultPromises.push(
            retry({
                action: async (attempted: number) => {
                    let result = await updateRemoteConfig({
                        update,
                        config: resconf[0],
                        authInfo: authInfo as Interfaces.AuthInfoInterface,
                        client,
                        privkeys: privkeysSign,
                        pubkeys,
                        hashAlgorithm: algos[0],
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
    let mainResult = results[mainNodeIndex]
    if (mainResult.status == 'fulfilled') {
        return mainResult.value[0]
    } else {
        throw mainResult.reason
    }
}

interface sharedParametersFull {
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
}
type excludedAttrsFull =
    | 'client'
    | 'pubkeys'
    | 'privatekeys'
    | keyof sharedParametersFull

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
    ...options
}:
    | Omit<
          Parameters<typeof updateContent>[0] &
              Parameters<typeof createContent>[0],
          excludedAttrsFull
      > &
          sharedParametersFull): Promise<
    | {
          config: UnpackPromise<ReturnType<typeof updateConfigRemoteReducer>>
          node: any
      }
    | false
> {
    const {
        hashes,
        actions: finishedActions,
        configUpdate,
    } = await transformActions({
        actions,
        mapper,
        hashAlgorithm,
    })

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
    const privkeys = extractPrivKeys({
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
        pubkeys = extractPubKeysCluster({
            node: pubkeysResult.data.secretgraph.node,
            authorization,
            params: {
                name: 'RSA-OAEP',
                hash: Constants.mapHashNames[hashAlgorithm].operationName,
            },
        })
    }

    try {
        const noptions = {
            client: itemClient,
            config,
            cluster,
            privkeys: Object.values(privkeys),
            pubkeys: Object.values(pubkeys),
            hashAlgorithm,
            actions: finishedActions,
            authorization,
            state,
            ...options,
        }
        const result = await (id
            ? updateContent({ ...noptions, id, updateId })
            : createContent({ ...noptions, type }))
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
                [result.data.updateOrCreateContent.content.id]: {
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
            }),
            node: result.data.updateOrCreateContent.content,
        }
    } catch (exc) {
        console.error(exc)
        return false
    }
}
