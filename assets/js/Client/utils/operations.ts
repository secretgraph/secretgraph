import { ApolloClient, FetchResult } from '@apollo/client'
import {
    createClusterMutation,
    updateClusterMutation,
} from '../queries/cluster'
import {
    createContentMutation,
    updateContentMutation,
    contentRetrievalQuery,
    createKeysMutation,
} from '../queries/content'
import {
    deleteNode as deleteNodeQuery,
    resetDeletionNode as resetDeletionNodeQuery,
} from '../queries/node'
import { serverConfigQuery } from '../queries/server'
import {
    ConfigInterface,
    ReferenceInterface,
    ActionInterface,
    AuthInfoInterface,
    KeyInput,
    CryptoHashPair,
    CryptoGCMOutInterface,
    ConfigInputInterface,
    CryptoGCMInInterface,
    RawInput,
} from '../interfaces'
import { mapHashNames } from '../constants'
import { b64toarr, sortedHash, utf8encoder } from './misc'
import {
    decryptRSAOEAP,
    encryptRSAOEAP,
    decryptAESGCM,
    encryptAESGCM,
    serializeToBase64,
    unserializeToArrayBuffer,
    extractTags,
    encryptTag,
    unserializeToCryptoKey,
} from './encryption'
import {
    cleanConfig,
    extractAuthInfo,
    extractPrivKeys,
    findCertCandidatesForRefs,
    updateConfigReducer,
} from './config'
import {
    encryptSharedKey,
    createSignatureReferences,
    extractPubKeysCluster,
    extractPubKeysRefs,
} from './graphql'

export async function deleteNode({
    id,
    client,
    authorization,
}: {
    id: string
    client: ApolloClient<any>
    authorization: string[]
}) {
    return await client.mutate({
        mutation: deleteNodeQuery,
        variables: {
            id,
            authorization,
        },
    })
}

export async function resetDeletionNode({
    id,
    client,
    authorization,
}: {
    id: string
    client: ApolloClient<any>
    authorization: string[]
}) {
    return await client.mutate({
        mutation: resetDeletionNodeQuery,
        variables: {
            id,
            authorization,
        },
    })
}

export async function createContent({
    client,
    cluster,
    actions,
    ...options
}: {
    client: ApolloClient<any>
    config: ConfigInterface
    cluster: string
    value: CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<ReferenceInterface> | null
    actions?: Iterable<ActionInterface>
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
            references: ([] as ReferenceInterface[]).concat(
                await publicKeyReferencesPromise,
                await signatureReferencesPromise,
                options.references ? [...options.references] : []
            ),
            tags,
            nonce: await serializeToBase64(nonce),
            value: await encryptedContentPromise.then(
                (data) => new File([data.data], 'value')
            ),
            actions: actions,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: options.authorization,
        },
    })
}

export async function createKeys({
    client,
    cluster,
    actions,
    privateKey,
    pubkeys,
    ...options
}: {
    client: ApolloClient<any>
    config: ConfigInterface
    cluster: string
    privateKey?: KeyInput | PromiseLike<KeyInput>
    publicKey: KeyInput | PromiseLike<KeyInput>
    pubkeys?: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    privateTags?: Iterable<string | PromiseLike<string>>
    publicTags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    actions?: Iterable<ActionInterface>
    hashAlgorithm: string
    authorization: Iterable<string>
}): Promise<FetchResult<any>> {
    const nonce = crypto.getRandomValues(new Uint8Array(13))
    const key = crypto.getRandomValues(new Uint8Array(32))
    const halgo = mapHashNames[options.hashAlgorithm].operationName

    const keyParams = {
        name: 'RSA-PSS',
        hash: halgo,
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
          }).then((data) => new File([data.data], 'privateKey'))
        : null

    if (!pubkeys) {
        pubkeys = []
    }

    const [
        [specialRef, ...publicKeyReferences],
        publicTags,
    ] = await Promise.all(
        encryptSharedKey(
            key,
            ([publicKey] as Parameters<typeof encryptSharedKey>[1]).concat(
                pubkeys
            ),
            halgo
        )
    )
    const signatureReferencesPromise = createSignatureReferences(
        publicKey,
        options.privkeys ? options.privkeys : [],
        halgo
    )
    const privateTags = [`key=${specialRef.extra}`]
    if (options.privateTags) {
        privateTags.push(...(await Promise.all(options.privateTags)))
    }
    if (options.publicTags) {
        publicTags.push(...(await Promise.all(options.publicTags)))
    }
    return await client.mutate({
        mutation: createKeysMutation,
        variables: {
            cluster,
            references: ([] as ReferenceInterface[]).concat(
                publicKeyReferences,
                await signatureReferencesPromise
            ),
            privateTags,
            publicTags,
            nonce: await serializeToBase64(nonce),
            publicKey: new File(
                [await unserializeToArrayBuffer(publicKey)],
                'publicKey'
            ),
            privateKey: await encryptedPrivateKeyPromise,
            actions: actions,
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
    config: ConfigInterface
    cluster?: string
    value?: CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<ReferenceInterface> | null
    actions?: Iterable<ActionInterface>
    hashAlgorithm?: string
    authorization: Iterable<string>
    encryptTags?: Iterable<string>
    // only for tag only updates if encryptTags is used
    oldKey?: RawInput
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

    let key: ArrayBuffer | undefined
    if (options.value) {
        key = crypto.getRandomValues(new Uint8Array(32))
    } else if (options.tags && encrypt && encrypt.size > 0) {
        if (!options.oldKey) {
            throw Error('Tag only update without oldKey')
        }
        key = await unserializeToArrayBuffer(options.oldKey)
    } else {
        key = undefined
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
            key: key as ArrayBuffer,
            nonce,
            data: options.value,
        })

        const [publicKeyReferencesPromise, tagsPromise2] = encryptSharedKey(
            key as ArrayBuffer,
            options.pubkeys,
            options.hashAlgorithm
        )
        const signatureReferencesPromise = createSignatureReferences(
            encryptedContent.data,
            options.privkeys ? options.privkeys : [],
            options.hashAlgorithm
        )
        references = ([] as ReferenceInterface[]).concat(
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
                                  key: key as ArrayBuffer,
                                  data: tagPromise,
                                  encrypt,
                              })
                          }
                      )
                  )
                : null,
            nonce: nonce ? await serializeToBase64(nonce) : undefined,
            value: encryptedContent
                ? new File([encryptedContent.data], 'value')
                : null,
            actions: options.actions ? options.actions : null,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: [...options.authorization],
        },
    })
}

export async function createCluster(options: {
    client: ApolloClient<any>
    actions: Iterable<ActionInterface>
    hashAlgorithm: string
    publicInfo: string
    publicKey: CryptoKey
    privateKey?: CryptoKey
    privateKeyKey?: Uint8Array
    authorization?: string[]
}): Promise<FetchResult<any>> {
    let nonce: null | Uint8Array = null

    let privateKeyPromise: Promise<null | File>
    const publicKeyPromise = unserializeToArrayBuffer(options.publicKey).then(
        (obj) => new File([obj], 'publicKey')
    )
    const privateTags = ['state=internal']
    if (options.privateKey && options.privateKeyKey) {
        nonce = crypto.getRandomValues(new Uint8Array(13))
        privateKeyPromise = encryptAESGCM({
            key: options.privateKeyKey,
            data: options.privateKey,
        }).then((obj) => new File([obj.data], 'privateKey'))
        privateTags.push(
            await encryptRSAOEAP({
                key: options.privateKey,
                data: options.privateKeyKey,
                hashAlgorithm: options.hashAlgorithm,
            })
                .then((data) => serializeToBase64(data.data))
                .then((obj) => `key=${obj}`)
        )
    } else {
        privateKeyPromise = Promise.resolve(null)
    }
    return await options.client.mutate({
        mutation: createClusterMutation,
        variables: {
            publicInfo: new File(
                [utf8encoder.encode(options.publicInfo)],
                'publicInfo'
            ),
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
    actions?: ActionInterface[]
    publicInfo?: string
    authorization: string[]
}): Promise<FetchResult<any>> {
    return await options.client.mutate({
        mutation: updateClusterMutation,
        variables: {
            id: options.id,
            updateId: options.updateId,
            publicInfo: new File(
                [utf8encoder.encode(options.publicInfo)],
                'publicInfo'
            ),
            actions: options.actions,
            authorization: options.authorization,
        },
    })
}

export async function initializeCluster(
    client: ApolloClient<any>,
    config: ConfigInterface
) {
    const key = crypto.getRandomValues(new Uint8Array(32))
    const { publicKey, privateKey } = (await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            //modulusLength: 8192,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: config.hosts[config.baseUrl].hashAlgorithms[0],
        },
        true,
        ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
    )) as CryptoKeyPair
    const digestCertificatePromise = crypto.subtle
        .exportKey('spki' as const, publicKey)
        .then((keydata) =>
            crypto.subtle
                .digest(config.hosts[config.baseUrl].hashAlgorithms[0], keydata)
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
    ].hashes[digestActionKey] = ['manage', 'create', 'update']
    config.hosts[config['baseUrl']].clusters[
        clusterResult.cluster['id']
    ].hashes[digestCertificate] = []
    config['certificates'][digestCertificate] = await serializeToBase64(
        privateKey
    )
    config.tokens[digestActionKey] = keyb64
    if (!cleanConfig(config)) {
        console.error('invalid config created')
        return
    }
    const digest = await sortedHash(
        ['type=Config'],
        config['hosts'][config['baseUrl']].hashAlgorithms[0]
    )

    const { keys: authorization } = extractAuthInfo({
        config: config,
        clusters: new Set([clusterResult.cluster['id']]),
        require: new Set(['manage']),
        url: config.baseUrl,
    })

    return await createContent({
        client,
        config,
        cluster: clusterResult.cluster['id'],
        value: new File([JSON.stringify(config)], 'value'),
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
    extends Omit<CryptoGCMOutInterface, 'nonce' | 'key'> {
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
    config: ConfigInterface | PromiseLike<ConfigInterface>
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
        if (!found) {
            return null
        }
        key = (
            await Promise.any(
                found.map(async (value) => {
                    return await decryptRSAOEAP({
                        key: config.certificates[value.hash],
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

export async function decryptContentId({
    client,
    config,
    url,
    id: contentId,
    decrypt,
}: {
    client: ApolloClient<any>
    config: ConfigInterface | PromiseLike<ConfigInterface>
    url: string
    id: string
    decrypt?: Set<string>
}) {
    const _config = await config
    const authinfo: AuthInfoInterface = extractAuthInfo({
        config: _config,
        url,
    })
    let result
    // TODO: maybe remove try catch
    try {
        result = await client.query({
            query: contentRetrievalQuery,
            variables: {
                id: contentId,
                authorization: authinfo.keys,
            },
        })
    } catch (error) {
        console.error('fetching failed', error)
        return null
    }
    if (!result.data) {
        return null
    }
    return await decryptContentObject({
        config: _config,
        nodeData: result.data.secretgraph.node,
        blobOrTokens: authinfo.keys,
        decrypt,
    })
}

export async function updateConfigRemoteReducer(
    state: ConfigInterface | null,
    {
        update,
        authInfo,
        ...props
    }: {
        update: ConfigInputInterface | null
        client: ApolloClient<any>
        authInfo?: AuthInfoInterface
    }
): Promise<ConfigInterface | null> {
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
        const configQueryRes = await props.client.query({
            query: contentRetrievalQuery,
            variables: {
                authorization: authInfo.keys,
            },
        })
        if (configQueryRes.errors) {
            throw configQueryRes.errors
        }
        const node = configQueryRes.data.node
        const foundConfig = await fetch(node.link, {
            headers: {
                Authorization: authInfo.keys.join(','),
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
        pubkeys = extractPubKeysRefs({
            node,
            authorization: authInfo.keys,
            params: {
                name: 'RSA-OAEP',
                hash: configQueryRes.data.config.hashAlgorithms[0],
            },
            old: pubkeys,
            onlyPubkeys: true,
        })

        const result = await updateContent({
            ...props,
            id: node.id,
            updateId: node.updateId,
            privkeys: Object.values(privkeys),
            pubkeys: Object.values(pubkeys),
            config: foundConfig,
            hashAlgorithm: configQueryRes.data.config.hashAlgorithms[0],
            value: new Blob([JSON.stringify(mergedConfig)]),
            authorization: authInfo.keys,
        })
        if (result.errors) {
            throw configQueryRes.errors
        }
        if (result.data.writeok) {
            return mergedConfig
        }
    }
}
