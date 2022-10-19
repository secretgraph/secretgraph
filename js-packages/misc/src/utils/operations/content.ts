import { ApolloClient, FetchResult } from '@apollo/client'
import {
    createContentMutation,
    findConfigQuery,
    updateContentMutation,
} from '@secretgraph/graphql-queries/content'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'

import { mapHashNames } from '../../constants'
import * as Constants from '../../constants'
import * as Interfaces from '../../interfaces'
import {
    authInfoFromConfig,
    cleanConfig,
    extractPrivKeys,
    findCertCandidatesForRefs,
    updateConfig,
} from '../config'
import {
    b64tobuffer,
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../encoding'
import {
    decryptAESGCM,
    decryptRSAOEAP,
    deparseTag,
    encryptAESGCM,
    encryptTag,
    extractTags,
    extractTagsRaw,
    unserializeToCryptoKey,
} from '../encryption'
import {
    createSignatureReferences,
    encryptSharedKey,
    extractPubKeysReferences,
} from '../graphql'
import { findWorkingHashAlgorithms, hashTagsContentHash } from '../hashing'
import { retry } from '../misc'

export async function createContent({
    client,
    cluster,
    net,
    tags: tagsIntern,
    value,
    ...options
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    cluster: string
    net?: string
    type: string
    state: string
    value: Interfaces.CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    authorization: Iterable<string>
}): Promise<FetchResult<any>> {
    const tagsOptions = await Promise.all(tagsIntern)
    const isPublic = Constants.public_states.includes(options.state)
    let nonce: Uint8Array | undefined, key: Uint8Array | undefined
    if (isPublic) {
        nonce = undefined
        key = undefined
    } else {
        nonce = crypto.getRandomValues(new Uint8Array(13))
        key = crypto.getRandomValues(new Uint8Array(32))
    }
    if (!isPublic && options.pubkeys.length == 0) {
        throw Error('No public keys provided')
    }

    const encryptedContentPromise = isPublic
        ? unserializeToArrayBuffer(value)
        : encryptAESGCM({
              key: key as NonNullable<typeof key>,
              nonce,
              data: value,
          }).then(
              (data) => {
                  return data.data
              },
              (reason) => {
                  console.error('encrypting content failed', key, nonce, reason)
                  throw reason
              }
          )
    const halgo = mapHashNames[options.hashAlgorithm].operationName

    const [publicKeyReferencesPromise, tagsPromise] = isPublic
        ? [[], []]
        : encryptSharedKey(
              key as NonNullable<typeof key>,
              options.pubkeys,
              halgo
          )
    const signatureReferencesPromise = encryptedContentPromise.then((data) =>
        createSignatureReferences(
            data,
            options.privkeys ? options.privkeys : [],
            halgo
        )
    )
    let tags: string[]
    if (isPublic) {
        tags = await Promise.all(
            ((await tagsPromise) as (string | PromiseLike<string>)[]).concat(
                tagsOptions
            )
        )
    } else {
        tags = await Promise.all(
            ((await tagsPromise) as (string | PromiseLike<string>)[])
                .concat(tagsOptions)
                .map((data) =>
                    encryptTag({
                        data,
                        key: key as NonNullable<typeof key>,
                    })
                )
        )
    }
    return await client.mutate({
        mutation: createContentMutation,
        // we need a current updateId
        awaitRefetchQueries: true,
        variables: {
            cluster,
            net: net || cluster,
            references: ([] as Interfaces.ReferenceInterface[]).concat(
                await publicKeyReferencesPromise,
                await signatureReferencesPromise,
                options.references ? [...options.references] : []
            ),
            tags,
            state: options.state,
            type: options.type,
            nonce: nonce ? await serializeToBase64(nonce) : undefined,
            value: await encryptedContentPromise.then(
                (data) => new Blob([data], { type: 'application/octet-stream' })
            ),
            actions: options.actions ? [...options.actions] : null,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: options.authorization,
        },
    })
}

export async function updateContent({
    id,
    updateId,
    client,
    state,
    net,
    ...options
}: {
    id: string
    updateId: string
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    cluster?: string
    net?: string
    state?: string
    value?: Interfaces.CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm?: string
    authorization: Iterable<string>
    // only for tag only updates if encryptTags is used
    oldKey?: Interfaces.RawInput
}): Promise<FetchResult<any>> {
    const tagsOptions = options.tags
        ? await Promise.all(options.tags)
        : options.value
        ? []
        : null
    const isPublic = state ? Constants.public_states.includes(state) : undefined
    let sharedKey: ArrayBuffer | undefined
    if (options.value) {
        sharedKey = crypto.getRandomValues(new Uint8Array(32))
    } else if (tagsOptions && tagsOptions.find((val) => val.startsWith('~'))) {
        if (!options.oldKey) {
            throw Error('Tag only update without oldKey')
        }
        sharedKey = await unserializeToArrayBuffer(options.oldKey)
    } else {
        sharedKey = undefined
    }
    const references: Interfaces.ReferenceInterface[] = []
    let tags: (PromiseLike<string> | string)[] | null = tagsOptions
    if (sharedKey && tagsOptions && !isPublic) {
        tags = tagsOptions.map((tag: string) => {
            return encryptTag({
                key: sharedKey as ArrayBuffer,
                data: tag,
            })
        })
    }
    let encryptedContent = null
    let nonce = undefined
    if (options.value) {
        if (!tagsOptions || !tagsOptions.length) {
            throw Error('No tags provided')
        }
        if (isPublic) {
            encryptedContent = await unserializeToArrayBuffer(options.value)

            if (
                options.privkeys &&
                options.privkeys.length &&
                !options.hashAlgorithm
            ) {
                throw Error('hashAlgorithm required for value signature')
            }
        } else {
            if (tags === null) {
                throw Error('tags required for value update')
            }
            if (!options.hashAlgorithm) {
                throw Error('hashAlgorithm required for value updates')
            }
            if (options.pubkeys.length == 0) {
                throw Error('No public keys provided')
            }
            nonce = crypto.getRandomValues(new Uint8Array(13))

            encryptedContent = (
                await encryptAESGCM({
                    key: sharedKey as ArrayBuffer,
                    nonce,
                    data: options.value,
                })
            ).data
            const [publicKeyReferencesPromise, tagsPromise2] = encryptSharedKey(
                sharedKey as ArrayBuffer,
                options.pubkeys,
                options.hashAlgorithm
            )
            references.push(...(await publicKeyReferencesPromise))
            tags.push(...(await tagsPromise2))
        }
        if (options.privkeys && options.privkeys.length) {
            references.push(
                ...(await createSignatureReferences(
                    encryptedContent,
                    options.privkeys,
                    options.hashAlgorithm as NonNullable<
                        typeof options.hashAlgorithm
                    >
                ))
            )
        }
    }
    if (options.references) {
        references.push(...options.references)
    }
    return await client.mutate({
        mutation: updateContentMutation,
        // we need a current updateId
        awaitRefetchQueries: true,
        variables: {
            id,
            updateId,
            net,
            cluster: options.cluster ? options.cluster : undefined,
            references,
            tags: tags ? await Promise.all(tags) : undefined,
            nonce: nonce ? await serializeToBase64(nonce) : undefined,
            value: encryptedContent
                ? new Blob([encryptedContent], {
                      type: 'application/octet-stream',
                  })
                : undefined,
            actions: options.actions ? [...options.actions] : undefined,
            contentHash: options.contentHash ? options.contentHash : undefined,
            authorization: [...options.authorization],
        },
    })
}
interface decryptContentObjectInterface
    extends Omit<Interfaces.CryptoGCMOutInterface, 'nonce' | 'key'> {
    tags: { [tag: string]: string[] }
    encryptedTags: Set<string>
    updateId: string
    nodeData: any
}

export async function decryptContentObject({
    config: _config,
    nodeData,
    blobOrTokens,
    baseUrl,
    decrypt = new Set(),
}: {
    config: Interfaces.ConfigInterface | PromiseLike<Interfaces.ConfigInterface>
    nodeData: any | PromiseLike<any>
    blobOrTokens:
        | Blob
        | string
        | string[]
        | PromiseLike<Blob | string | string[]>
    baseUrl?: string
    decrypt?: Set<string>
}): Promise<decryptContentObjectInterface | null> {
    let arrPromise: PromiseLike<ArrayBufferLike>
    const _info = await blobOrTokens
    const config = await _config
    const _node = await nodeData
    if (!_node) {
        throw Error('no node found')
    }
    if (_info instanceof Blob) {
        arrPromise = _info.arrayBuffer()
    } else if (typeof _info == 'string') {
        arrPromise = Promise.resolve(b64tobuffer(_info))
    } else {
        arrPromise = fetch(
            new URL(_node.link, baseUrl || config.baseUrl).href,
            {
                headers: {
                    Authorization: _info.join(','),
                },
            }
        ).then((result) => result.arrayBuffer())
    }
    // skip decryption as always unencrypted
    if (_node.type == 'PublicKey' || _node.state == 'public') {
        return {
            data: await arrPromise,
            tags: await extractTagsRaw({
                tags: nodeData.tags,
            }),
            encryptedTags: new Set(),
            updateId: nodeData.updateId,
            nodeData,
        }
    }
    let key
    try {
        const found = findCertCandidatesForRefs(config, _node)
        if (!found.length) {
            console.debug('No certificate tag found')
            return null
        }
        // find key (=first result of decoding shared key)
        key = (
            await Promise.any(
                found.map(async (value) => {
                    return await decryptRSAOEAP({
                        key: config.certificates[value.hash].data,
                        data: value.sharedKey,
                        hashAlgorithm: value.hashAlgorithm,
                    })
                })
            )
        ).data
    } catch (exc) {
        console.debug(
            'No matching certificate nor key tag found',
            exc,
            exc?.errors
        )
        return null
    }

    // if this fails, it means shared key and encrypted object doesn't match
    try {
        return {
            ...(await decryptAESGCM({
                key,
                nonce: _node.nonce,
                data: arrPromise,
            })),
            ...(await extractTags({ key, tags: nodeData.tags })),
            updateId: nodeData.updateId,
            nodeData,
        }
    } catch (exc) {
        console.debug('Decoding content failed', exc)
        throw Error("Encrypted content and shared key doesn't match")
    }
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
    privkeys: CryptoKey[]
    pubkeys: CryptoKey[]
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
    if (!cleanConfig(mergedConfig)) {
        throw Error('invalid merged config')
    }
    // updates cache
    const result = await updateContent({
        client,
        id: node.id,
        updateId: node.updateId,
        privkeys: Object.values(privkeys),
        pubkeys: Object.values(pubkeys),
        state: 'internal',
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
    slotHashes = await Promise.all(
        slotHashes.map((slot: string) =>
            hashTagsContentHash([`slot=${slot}`], algos[0], 'Config')
        )
    )
    const configQueryRes = await client.query({
        query: findConfigQuery,
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

    const privkeys = await Promise.all(
        Object.values(
            extractPrivKeys({
                config: resconf[0],
                url: resconf[0].baseUrl,
                hashAlgorithm: algos[0],
            })
        )
    )
    const pubkeys = await Promise.all(
        privkeys.map((privKey: CryptoKey) =>
            unserializeToCryptoKey(
                privKey,
                {
                    name: 'RSA-OAEP',
                    hash: algos[0],
                },
                'publicKey'
            )
        )
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
                        privkeys,
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
