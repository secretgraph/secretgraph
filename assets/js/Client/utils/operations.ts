import { ApolloClient, FetchResult } from '@apollo/client'

import { mapHashNames } from '../constants'
import * as Interfaces from '../interfaces'
import {
    createClusterMutation,
    getClusterQuery,
    updateClusterMutation,
} from '../queries/cluster'
import {
    contentRetrievalQuery,
    createContentMutation,
    createKeysMutation,
    updateContentMutation,
    updateKeyMutation,
} from '../queries/content'
import {
    deleteNodes as deleteNodeQuery,
    resetDeletionNodes as resetDeletionNodeQuery,
} from '../queries/node'
import { extractPublicInfo } from './cluster'
import {
    cleanConfig,
    extractAuthInfo,
    extractPrivKeys,
    findCertCandidatesForRefs,
    updateConfigReducer,
} from './config'
import {
    decryptAESGCM,
    decryptRSAOEAP,
    encryptAESGCM,
    encryptRSAOEAP,
    encryptTag,
    extractTags,
    serializeToBase64,
    unserializeToArrayBuffer,
    unserializeToCryptoKey,
} from './encryption'
import {
    createSignatureReferences,
    encryptSharedKey,
    extractPubKeysCluster,
    extractPubKeysReferences,
} from './graphql'
import { b64toarr, sortedHash, utf8encoder } from './misc'

export async function deleteNodes({
    ids,
    client,
    authorization,
}: {
    ids: string[]
    client: ApolloClient<any>
    authorization: string[]
}) {
    return await client.mutate({
        mutation: deleteNodeQuery,
        variables: {
            ids,
            authorization,
        },
    })
}

export async function resetDeletionNodes({
    ids,
    client,
    authorization,
}: {
    ids: string[]
    client: ApolloClient<any>
    authorization: string[]
}) {
    return await client.mutate({
        mutation: resetDeletionNodeQuery,
        variables: {
            ids,
            authorization,
        },
    })
}

export async function createContent({
    client,
    cluster,
    ...options
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    cluster: string
    value: Interfaces.CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    authorization: Iterable<string>
    encryptTags?: Iterable<string>
}): Promise<FetchResult<any>> {
    if (options.pubkeys.length == 0) {
        throw Error('No public keys provided')
    }
    const nonce = crypto.getRandomValues(new Uint8Array(13))
    const key = crypto.getRandomValues(new Uint8Array(32))

    const encryptedContentPromise = encryptAESGCM({
        key,
        nonce,
        data: options.value,
    })
    const halgo = mapHashNames[options.hashAlgorithm].operationName

    const [publicKeyReferencesPromise, tagsPromise] = encryptSharedKey(
        key,
        options.pubkeys,
        halgo
    )
    const signatureReferencesPromise = encryptedContentPromise.then((data) =>
        createSignatureReferences(
            data.data,
            options.privkeys ? options.privkeys : [],
            halgo
        )
    )
    const encrypt = new Set<string>(options.encryptTags)
    const tags = await Promise.all(
        ((await tagsPromise) as (string | PromiseLike<string>)[])
            .concat([...options.tags])
            .map((data) => encryptTag({ data, key, encrypt }))
    )
    return await client.mutate({
        mutation: createContentMutation,
        variables: {
            cluster,
            references: ([] as Interfaces.ReferenceInterface[]).concat(
                await publicKeyReferencesPromise,
                await signatureReferencesPromise,
                options.references ? [...options.references] : []
            ),
            tags,
            nonce: await serializeToBase64(nonce),
            value: await encryptedContentPromise.then(
                (data) => new Blob([data.data])
            ),
            actions: options.actions ? [...options.actions] : null,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: options.authorization,
        },
    })
}

export async function createKeys({
    client,
    cluster,
    privateKey,
    pubkeys,
    ...options
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    cluster: string
    privateKey?: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>
    publicKey: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>
    pubkeys?: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    privateTags?: Iterable<string | PromiseLike<string>>
    publicTags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    privateActions?: Iterable<Interfaces.ActionInterface>
    publicActions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    authorization: Iterable<string>
}): Promise<FetchResult<any>> {
    const nonce = crypto.getRandomValues(new Uint8Array(13))
    const key = crypto.getRandomValues(new Uint8Array(32))
    const halgo = mapHashNames[options.hashAlgorithm]

    const keyParams = {
        name: 'RSA-PSS',
        hash: halgo.operationName,
    }
    const publicKey = await unserializeToCryptoKey(
        options.publicKey,
        keyParams,
        'publicKey'
    )

    const encryptedPrivateKeyPromise = privateKey
        ? encryptAESGCM({
              key,
              nonce,
              data: unserializeToCryptoKey(privateKey, keyParams, 'privateKey'),
          }).then((data) => new Blob([data.data]))
        : null

    if (!pubkeys) {
        pubkeys = []
    }

    const [[specialRef, ...references], privateTags] = await Promise.all(
        encryptSharedKey(
            key,
            ([publicKey] as Parameters<typeof encryptSharedKey>[1]).concat(
                pubkeys
            ),
            halgo.operationName
        )
    )
    privateTags.push(`key=${specialRef.extra}`)
    const signatureReferencesPromise = createSignatureReferences(
        publicKey,
        options.privkeys ? options.privkeys : [],
        halgo.operationName
    )
    if (options.privateTags) {
        privateTags.push(...(await Promise.all(options.privateTags)))
    }
    if (privateTags.every((val) => !val.startsWith('state='))) {
        privateTags.push('state=internal')
    }
    const publicTags: string[] = options.publicTags
        ? await Promise.all(options.publicTags)
        : []
    if (publicTags.every((val) => !val.startsWith('state='))) {
        publicTags.push('state=public')
    }
    return await client.mutate({
        mutation: createKeysMutation,
        variables: {
            cluster,
            references: references.concat(await signatureReferencesPromise),
            privateTags,
            publicTags,
            nonce: await serializeToBase64(nonce),
            publicKey: new Blob([await unserializeToArrayBuffer(publicKey)]),
            privateKey: await encryptedPrivateKeyPromise,
            privateActions: options.privateActions
                ? [...options.privateActions]
                : undefined,
            publicActions: options.publicActions
                ? [...options.publicActions]
                : undefined,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: options.authorization,
        },
    })
}

export async function updateContent({
    id,
    updateId,
    client,
    ...options
}: {
    id: string
    updateId: string
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    cluster?: string
    value?: Interfaces.CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm?: string
    authorization: Iterable<string>
    encryptTags?: Iterable<string>
    // only for tag only updates if encryptTags is used
    oldKey?: Interfaces.RawInput
}): Promise<FetchResult<any>> {
    let references
    const tags = options.tags
        ? await Promise.all(options.tags)
        : options.value
        ? []
        : null
    const encrypt: Set<string> | undefined = options.encryptTags
        ? new Set(options.encryptTags)
        : undefined

    let sharedKey: ArrayBuffer | undefined
    if (options.value) {
        sharedKey = crypto.getRandomValues(new Uint8Array(32))
    } else if (options.tags && encrypt && encrypt.size > 0) {
        if (!options.oldKey) {
            throw Error('Tag only update without oldKey')
        }
        sharedKey = await unserializeToArrayBuffer(options.oldKey)
    } else {
        sharedKey = undefined
    }
    let encryptedContent = null
    let nonce = undefined
    if (options.value) {
        nonce = crypto.getRandomValues(new Uint8Array(13))
        if (!options.hashAlgorithm) {
            throw Error('hashAlgorithm required for value updates')
        }
        if (options.pubkeys.length == 0) {
            throw Error('No public keys provided')
        }
        encryptedContent = await encryptAESGCM({
            key: sharedKey as ArrayBuffer,
            nonce,
            data: options.value,
        })

        const [publicKeyReferencesPromise, tagsPromise2] = encryptSharedKey(
            sharedKey as ArrayBuffer,
            options.pubkeys,
            options.hashAlgorithm
        )
        const signatureReferencesPromise = createSignatureReferences(
            encryptedContent.data,
            options.privkeys ? options.privkeys : [],
            options.hashAlgorithm
        )
        references = ([] as Interfaces.ReferenceInterface[]).concat(
            await publicKeyReferencesPromise,
            await signatureReferencesPromise,
            options.references ? [...options.references] : []
        )
        ;(tags as string[]).push(...(await tagsPromise2))
    } else {
        references = options.references ? options.references : null
    }
    return await client.mutate({
        mutation: updateContentMutation,
        variables: {
            id,
            updateId,
            cluster: options.cluster ? options.cluster : null,
            references,
            tags: tags
                ? await Promise.all(
                      tags.map(
                          async (tagPromise: string | PromiseLike<string>) => {
                              return await encryptTag({
                                  key: sharedKey as ArrayBuffer,
                                  data: tagPromise,
                                  encrypt,
                              })
                          }
                      )
                  )
                : null,
            nonce: nonce ? await serializeToBase64(nonce) : undefined,
            value: encryptedContent ? new Blob([encryptedContent.data]) : null,
            actions: options.actions ? [...options.actions] : null,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: [...options.authorization],
        },
    })
}

export async function updateKey({
    id,
    updateId,
    client,
    ...options
}: {
    id: string
    updateId: string
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    cluster?: string
    key?: CryptoKey | PromiseLike<CryptoKey> // key or key data
    pubkeys?: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm?: string
    authorization: Iterable<string>
    encryptTags?: Iterable<string>
    // only for tag only updates if encryptTags is used
    oldKey?: Interfaces.RawInput
}): Promise<FetchResult<any>> {
    let references
    const updatedKey = await options.key
    const tags = options.tags
        ? await Promise.all(options.tags)
        : updatedKey
        ? []
        : null
    const encrypt: Set<string> | undefined = options.encryptTags
        ? new Set(options.encryptTags)
        : undefined
    let sharedKey: ArrayBuffer | undefined
    if (updatedKey && updatedKey.type == 'private') {
        sharedKey = crypto.getRandomValues(new Uint8Array(32))
    } else if (options.tags && encrypt && encrypt.size > 0) {
        if (!options.oldKey) {
            throw Error('Tag only update without oldKey')
        }
        sharedKey = await unserializeToArrayBuffer(options.oldKey)
    } else {
        sharedKey = undefined
    }
    let completedKey = null
    let nonce = undefined
    if (updatedKey && updatedKey.type == 'private') {
        nonce = crypto.getRandomValues(new Uint8Array(13))
        if (!options.hashAlgorithm) {
            throw Error('hashAlgorithm required for key updates')
        }
        if (!options.pubkeys || options.pubkeys.length == 0) {
            throw Error('No public keys provided')
        }
        completedKey = await encryptAESGCM({
            key: sharedKey as ArrayBuffer,
            nonce,
            data: updatedKey,
        })

        const [
            [specialRef, ...publicKeyReferences],
            privateTags,
        ] = await Promise.all(
            encryptSharedKey(
                sharedKey as ArrayBuffer,
                ([updatedKey] as Parameters<typeof encryptSharedKey>[1]).concat(
                    options.pubkeys
                ),
                options.hashAlgorithm
            )
        )
        ;(tags as string[]).push(`key=${specialRef.extra}`, ...privateTags)
        references = publicKeyReferences.concat(
            options.references ? [...options.references] : []
        )

        if ((tags as string[]).every((val) => !val.startsWith('state='))) {
            ;(tags as string[]).push('state=internal')
        }
    } else if (updatedKey && updatedKey.type == 'public') {
        if (!options.hashAlgorithm) {
            throw Error('hashAlgorithm required for key resigning')
        }
        completedKey = { data: await unserializeToArrayBuffer(updatedKey) }
        const signatureReferencesPromise = createSignatureReferences(
            updatedKey,
            options.privkeys ? options.privkeys : [],
            options.hashAlgorithm
        )
        references = (await signatureReferencesPromise).concat(
            options.references ? [...options.references] : []
        )
        if (tags && tags.every((val) => !val.startsWith('state='))) {
            tags.push('state=public')
        }
    } else {
        references = options.references ? options.references : null
    }

    if (tags && tags.every((val) => !val.startsWith('state='))) {
        throw Error('Missing state')
    }
    return await client.mutate({
        mutation: updateKeyMutation,
        variables: {
            id,
            updateId,
            cluster: options.cluster ? options.cluster : null,
            references,
            tags: tags
                ? await Promise.all(
                      tags.map(
                          async (tagPromise: string | PromiseLike<string>) => {
                              return await encryptTag({
                                  key: sharedKey as ArrayBuffer,
                                  data: tagPromise,
                                  encrypt,
                              })
                          }
                      )
                  )
                : null,
            nonce: nonce ? await serializeToBase64(nonce) : undefined,
            key: completedKey ? new Blob([completedKey.data]) : null,
            actions: options.actions ? [...options.actions] : null,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: [...options.authorization],
        },
    })
}

export async function createCluster(options: {
    client: ApolloClient<any>
    actions: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    publicInfo: string
    publicKey: CryptoKey
    privateKey?: CryptoKey
    privateKeyKey?: Uint8Array
    authorization?: string[]
}): Promise<FetchResult<any>> {
    let nonce: null | Uint8Array = null
    const halgo = mapHashNames[options.hashAlgorithm]

    let privateKeyPromise: Promise<null | Blob>
    const publicKeyPromise = unserializeToArrayBuffer(options.publicKey).then(
        (obj) => new Blob([obj])
    )
    const privateTags = ['state=internal']
    if (options.privateKey && options.privateKeyKey) {
        nonce = crypto.getRandomValues(new Uint8Array(13))
        privateKeyPromise = encryptAESGCM({
            key: options.privateKeyKey,
            data: options.privateKey,
            nonce,
        }).then((obj) => new Blob([obj.data]))
        privateTags.push(
            await encryptRSAOEAP({
                key: options.privateKey,
                data: options.privateKeyKey,
                hashAlgorithm: options.hashAlgorithm,
            })
                .then((data) => serializeToBase64(data.data))
                .then((obj) => `key=${halgo.serializedName}:${obj}`)
        )
    } else {
        privateKeyPromise = Promise.resolve(null)
    }
    return await options.client.mutate({
        mutation: createClusterMutation,
        variables: {
            publicInfo: new Blob([utf8encoder.encode(options.publicInfo)]),
            publicKey: await publicKeyPromise,
            privateKey: await privateKeyPromise,
            privateTags: privateTags,
            nonce: nonce ? await serializeToBase64(nonce) : null,
            actions: options.actions,
            authorization: options.authorization,
        },
    })
}

export async function updateCluster(options: {
    id: string
    client: ApolloClient<any>
    updateId: string
    actions?: Interfaces.ActionInterface[]
    publicInfo?: string
    authorization: string[]
}): Promise<FetchResult<any>> {
    return await options.client.mutate({
        mutation: updateClusterMutation,
        variables: {
            id: options.id,
            updateId: options.updateId,
            publicInfo: new Blob([utf8encoder.encode(options.publicInfo)]),
            actions: options.actions,
            authorization: options.authorization,
        },
    })
}

export async function initializeCluster(
    client: ApolloClient<any>,
    config: Interfaces.ConfigInterface
) {
    const key = crypto.getRandomValues(new Uint8Array(32))
    const halgo = mapHashNames[config.hosts[config.baseUrl].hashAlgorithms[0]]
    const { publicKey, privateKey } = await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            //modulusLength: 8192,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: halgo.operationName,
        },
        true,
        ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
    )
    const digestCertificatePromise = crypto.subtle
        .exportKey('spki' as const, publicKey)
        .then((keydata) =>
            crypto.subtle
                .digest(halgo.operationName, keydata)
                .then((data) =>
                    btoa(String.fromCharCode(...new Uint8Array(data)))
                )
        )
    const digestActionKeyPromise = crypto.subtle
        .digest(
            config.hosts[config.baseUrl].hashAlgorithms[0],
            crypto.getRandomValues(new Uint8Array(32))
        )
        .then((data) => btoa(String.fromCharCode(...new Uint8Array(data))))
    const keyb64 = btoa(String.fromCharCode(...key))
    const clusterResponse = await createCluster({
        client,
        actions: [{ value: '{"action": "manage"}', key: keyb64 }],
        publicInfo: '',
        hashAlgorithm: config.hosts[config.baseUrl].hashAlgorithms[0],
        publicKey,
        privateKey,
        privateKeyKey: key,
    })
    const clusterResult = clusterResponse.data.updateOrCreateCluster
    const [digestActionKey, digestCertificate] = await Promise.all([
        digestActionKeyPromise,
        digestCertificatePromise,
    ])
    config.configCluster = clusterResult.cluster['id']
    config.configHashes = [digestActionKey, digestCertificate]
    config.hosts[config['baseUrl']].clusters[clusterResult.cluster['id']] = {
        hashes: {},
    }
    config.hosts[config['baseUrl']].clusters[
        clusterResult.cluster['id']
    ].hashes[digestActionKey] = ['manage']
    config.hosts[config['baseUrl']].clusters[
        clusterResult.cluster['id']
    ].hashes[digestCertificate] = []
    config['certificates'][digestCertificate] = {
        token: await serializeToBase64(privateKey),
        note: 'initial certificate',
    }
    config.tokens[digestActionKey] = {
        token: keyb64,
        note: 'initial token',
    }
    if (!cleanConfig(config)) {
        console.error('invalid config created')
        return
    }
    const digest = await sortedHash(
        ['type=Config'],
        config['hosts'][config['baseUrl']].hashAlgorithms[0]
    )

    const { tokens: authorization } = extractAuthInfo({
        config: config,
        clusters: new Set([clusterResult.cluster['id']]),
        require: new Set(['manage']),
        url: config.baseUrl,
    })

    return await createContent({
        client,
        config,
        cluster: clusterResult.cluster['id'],
        value: new Blob([JSON.stringify(config)]),
        pubkeys: [publicKey],
        privkeys: [privateKey],
        tags: ['type=Config', 'state=internal'],
        contentHash: digest,
        hashAlgorithm: config['hosts'][config['baseUrl']].hashAlgorithms[0],
        authorization,
    }).then(() => {
        return [config, clusterResult.cluster.id as string]
    })
}

interface decryptContentObjectInterface
    extends Omit<Interfaces.CryptoGCMOutInterface, 'nonce' | 'key'> {
    tags: { [tag: string]: string[] }
    updateId: string
    nodeData: any
}

export async function decryptContentObject({
    config: _config,
    nodeData,
    blobOrTokens,
    decrypt = new Set(),
}: {
    config: Interfaces.ConfigInterface | PromiseLike<Interfaces.ConfigInterface>
    nodeData: any | PromiseLike<any>
    blobOrTokens:
        | Blob
        | string
        | string[]
        | PromiseLike<Blob | string | string[]>
    decrypt?: Set<string>
}): Promise<decryptContentObjectInterface | null> {
    let arrPromise: PromiseLike<ArrayBufferLike>
    const _info = await blobOrTokens
    const _node = await nodeData
    const config = await _config
    if (!_node) {
        console.error('no node found')
        return null
    }
    if (_info instanceof Blob) {
        arrPromise = _info.arrayBuffer()
    } else if (typeof _info == 'string') {
        arrPromise = Promise.resolve(b64toarr(_info).buffer)
    } else {
        arrPromise = fetch(_node.link, {
            headers: {
                Authorization: _info.join(','),
            },
        }).then((result) => result.arrayBuffer())
    }
    if (_node.tags.includes('type=PublicKey')) {
        return {
            data: await arrPromise,
            tags: nodeData.tags,
            updateId: nodeData.updateId,
            nodeData,
        }
    }
    let key
    try {
        const found = findCertCandidatesForRefs(config, _node)
        if (!found.length) {
            return null
        }
        key = (
            await Promise.any(
                found.map(async (value) => {
                    return await decryptRSAOEAP({
                        key: config.certificates[value.hash].token,
                        data: value.sharedKey,
                        hashAlgorithm: value.hashAlgorithm,
                    })
                })
            )
        ).data
    } catch (exc) {
        console.error(exc, exc?.errors)
        return null
    }

    try {
        return {
            ...(await decryptAESGCM({
                key,
                nonce: _node.nonce,
                data: arrPromise,
            })),
            updateId: nodeData.updateId,
            tags: await extractTags({ key, tags: nodeData.tags, decrypt }),
            nodeData,
        }
    } catch (exc) {
        console.error(exc)
        return null
    }
}

export async function updateConfigRemoteReducer(
    state: Interfaces.ConfigInterface | null,
    {
        update,
        authInfo,
        client,
    }: {
        update: Interfaces.ConfigInputInterface | null
        client: ApolloClient<any>
        authInfo?: Interfaces.AuthInfoInterface
    }
): Promise<Interfaces.ConfigInterface | null> {
    if (update === null) {
        return null
    }
    const config = state || updateConfigReducer(null, update)
    if (!authInfo) {
        authInfo = extractAuthInfo({
            config,
            url: config.baseUrl,
            clusters: new Set([config.configCluster]),
        })
    }
    let privkeys = undefined
    let pubkeys = undefined

    while (true) {
        const configQueryRes = await client.query({
            query: contentRetrievalQuery,
            variables: {
                authorization: authInfo.tokens,
            },
        })
        if (configQueryRes.errors) {
            throw configQueryRes.errors
        }
        const node = configQueryRes.data.node
        const foundConfig = await fetch(node.link, {
            headers: {
                Authorization: authInfo.tokens.join(','),
            },
        }).then((result) => result.json())
        const mergedConfig = updateConfigReducer(foundConfig, update)
        mergedConfig.hosts[mergedConfig.baseUrl].hashAlgorithms =
            configQueryRes.data.config.hashAlgorithms
        privkeys = extractPrivKeys({
            config: mergedConfig,
            url: mergedConfig.baseUrl,
            hashAlgorithm: configQueryRes.data.config.hashAlgorithms[0],
            old: privkeys,
        })
        pubkeys = extractPubKeysReferences({
            node,
            authorization: authInfo.tokens,
            params: {
                name: 'RSA-OAEP',
                hash: configQueryRes.data.config.hashAlgorithms[0],
            },
            old: pubkeys,
            onlyPubkeys: true,
        })

        const result = await updateContent({
            client,
            id: node.id,
            updateId: node.updateId,
            privkeys: Object.values(privkeys),
            pubkeys: Object.values(pubkeys),
            config: foundConfig,
            hashAlgorithm: configQueryRes.data.config.hashAlgorithms[0],
            value: new Blob([JSON.stringify(mergedConfig)]),
            authorization: authInfo.tokens,
        })
        if (result.errors) {
            throw configQueryRes.errors
        }
        if (result.data.writeok) {
            return mergedConfig
        }
    }
}

export async function loadAndExtractClusterInfo({
    client,
    authorization,
    id,
}: {
    client: ApolloClient<any>
    authorization: string[]
    id: string
}) {
    const { data } = await client.query({
        query: getClusterQuery,
        variables: {
            id,
            authorization,
        },
    })
    return {
        ...extractPublicInfo(data.secretgraph.node.publicInfo, false),
        node: data.secretgraph.node,
    }
}
