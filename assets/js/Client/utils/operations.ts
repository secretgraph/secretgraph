import {
    createClusterMutation,
    updateClusterMutation,
} from '../queries/cluster'
import {
    createContentMutation,
    updateContentMutation,
    contentRetrievalQuery,
    getContentConfigurationQuery,
    findConfigQuery,
} from '../queries/content'
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
} from '../interfaces'
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
} from './encryption'
import { ApolloClient, FetchResult } from '@apollo/client'
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
import { mapHashNames } from '../constants'

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
    const s = new Set<string>()
    const tags = await Promise.all(
        ((await tagsPromise) as (string | PromiseLike<string>)[])
            .concat([...options.tags])
            .map((data) => encryptTag({ data, key, encrypt: s }))
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
    value: CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<ReferenceInterface> | null
    actions?: Iterable<ActionInterface>
    hashAlgorithm: string
    authorization: Iterable<string>
    encryptTags?: Iterable<string>
}): Promise<FetchResult<any>> {
    const nonce = crypto.getRandomValues(new Uint8Array(13))
    const key = crypto.getRandomValues(new Uint8Array(32))
    let contentPromise: Promise<null | File> = Promise.resolve(null)
    let references
    let tagsPromise
    const encrypt: Set<string> | undefined = options.encryptTags
        ? new Set(options.encryptTags)
        : undefined

    const halgo = mapHashNames[options.hashAlgorithm].operationName
    if (options.value) {
        const encryptedContentPromise2 = encryptAESGCM({
            key,
            nonce,
            data: options.value,
        })

        const [publicKeyReferencesPromise, tagsPromise2] = encryptSharedKey(
            key,
            options.pubkeys,
            halgo
        )
        tagsPromise = tagsPromise2
        const signatureReferencesPromise = encryptedContentPromise2.then(
            (data) =>
                createSignatureReferences(
                    data.data,
                    options.privkeys ? options.privkeys : [],
                    halgo
                )
        )
        contentPromise = encryptedContentPromise2.then(
            (data) => new File([data.data], 'value')
        )
        references = ([] as ReferenceInterface[]).concat(
            await publicKeyReferencesPromise,
            await signatureReferencesPromise,
            options.references ? [...options.references] : []
        )
    } else {
        references = options.references ? options.references : null
        tagsPromise = options.tags ? options.tags : null
    }

    return await client.mutate({
        mutation: updateContentMutation,
        variables: {
            id,
            updateId,
            cluster: options.cluster ? options.cluster : null,
            references,
            tags: ((await tagsPromise) as
                | (string | PromiseLike<string>)[]
                | undefined)?.map(
                async (tagPromise: string | PromiseLike<string>) => {
                    return await encryptTag({
                        key,
                        data: tagPromise,
                        encrypt,
                    })
                }
            ),
            nonce: await serializeToBase64(nonce),
            value: await contentPromise,
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
    extends Omit<Omit<CryptoGCMOutInterface, 'nonce'>, 'key'> {
    tags: { [tag: string]: string[] }
    updateId: string
    nodeData: any
}

export async function decryptContentObject({
    config,
    nodeData,
    blobOrAuthinfo,
    decrypt = new Set(),
}: {
    config: ConfigInterface | PromiseLike<ConfigInterface>
    nodeData: any | PromiseLike<any>
    blobOrAuthinfo:
        | Blob
        | string
        | AuthInfoInterface
        | PromiseLike<Blob | string | AuthInfoInterface>
    decrypt?: Set<string>
}): Promise<decryptContentObjectInterface | null> {
    let arrPromise: PromiseLike<ArrayBufferLike>
    const _info = await blobOrAuthinfo
    const _node = await nodeData
    if (_info instanceof Blob) {
        arrPromise = _info.arrayBuffer()
    } else if (typeof _info == 'string') {
        arrPromise = Promise.resolve(b64toarr(_info).buffer)
    } else {
        arrPromise = fetch(_node.link, {
            headers: {
                Authorization: _info.keys.join(','),
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
    const found = findCertCandidatesForRefs(await config, _node)
    if (!found) {
        return null
    }
    const sharedkeyPromise = Promise.any(
        found.map(async (value) => {
            return await decryptRSAOEAP({
                key: (await config).certificates[value[0]],
                data: value[1],
            })
        })
    )
    const key = (await sharedkeyPromise).data
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
        nodeData: result.data.node,
        blobOrAuthinfo: authinfo,
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
