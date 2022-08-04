import { ApolloClient, FetchResult } from '@apollo/client'
import {
    createClusterMutation,
    updateClusterMutation,
} from '@secretgraph/graphql-queries/cluster'

import { mapHashNames } from '../../constants'
import * as Interfaces from '../../interfaces'
import { authInfoFromConfig, cleanConfig } from '../config'
import {
    encryptAESGCM,
    encryptRSAOEAP,
    hashObject,
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../encryption'
import { sortedHash } from '../misc'
import { createContent } from './content'

export async function createCluster(options: {
    client: ApolloClient<any>
    actions: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    name?: string
    description?: string
    public?: boolean
    featured?: boolean
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
    const privateTags = []
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
        // we need a current updateId
        awaitRefetchQueries: true,
        variables: {
            name: options.name,
            description: options.description,
            publicKey: await publicKeyPromise,
            privateKey: await privateKeyPromise,
            privateTags: privateTags,
            nonce: nonce ? await serializeToBase64(nonce) : null,
            actions: options.actions,
            authorization: options.authorization,
            public: options.public,
            featured: options.featured,
        },
    })
}

export async function updateCluster(options: {
    id: string
    client: ApolloClient<any>
    updateId: string
    actions?: Interfaces.ActionInterface[]
    public?: boolean
    featured?: boolean
    name?: string
    description?: string
    authorization: string[]
}): Promise<FetchResult<any>> {
    return await options.client.mutate({
        mutation: updateClusterMutation,
        // we need a current updateId
        awaitRefetchQueries: true,
        variables: {
            id: options.id,
            updateId: options.updateId,
            name: options.name,
            description: options.description,
            actions: options.actions,
            authorization: options.authorization,
            public: options.public,
            featured: options.featured,
        },
    })
}

export async function initializeCluster({
    hashAlgorithm,
    client,
    config,
    name,
    description,
    ...options
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    name?: string
    description?: string
    public?: boolean
    featured?: boolean
    hashAlgorithm: string
}) {
    const manage_key = crypto.getRandomValues(new Uint8Array(32))
    const view_key = crypto.getRandomValues(new Uint8Array(32))
    const { publicKey, privateKey } = (await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            //modulusLength: 8192,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: hashAlgorithm,
        },
        true,
        ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
    )) as Required<CryptoKeyPair>
    const digestCertificatePromise = crypto.subtle
        .exportKey('spki' as const, publicKey)
        .then((keydata) =>
            crypto.subtle
                .digest(hashAlgorithm, keydata)
                .then((data) => Buffer.from(data).toString('base64'))
        )
        .then((data) => Buffer.from(data).toString('base64'))
    const digestManageKeyPromise = crypto.subtle
        .digest(hashAlgorithm, manage_key)
        .then((data) => Buffer.from(data).toString('base64'))
    const digestViewKeyPromise = crypto.subtle
        .digest(hashAlgorithm, view_key)
        .then((data) => Buffer.from(data).toString('base64'))
    const manage_keyb64 = Buffer.from(manage_key).toString('base64')
    const view_keyb64 = Buffer.from(manage_key).toString('base64')
    const clusterResponse = await createCluster({
        client,
        actions: [
            { value: '{"action": "manage"}', key: manage_keyb64 },
            {
                value: '{"action": "view", "includeTypes": ["COnfig"]}',
                key: view_keyb64,
            },
        ],
        name,
        description,
        hashAlgorithm,
        publicKey,
        privateKey,
        privateKeyKey: manage_key,
        ...options,
    })
    const clusterResult = clusterResponse.data.updateOrCreateCluster
    const [digestManageKey, digestViewKey, digestCertificate] =
        await Promise.all([
            digestManageKeyPromise,
            digestViewKeyPromise,
            digestCertificatePromise,
        ])
    config.configCluster = clusterResult.cluster['id']
    config.hosts[config['baseUrl']].clusters[clusterResult.cluster['id']] = {
        hashes: {},
    }
    config.hosts[config['baseUrl']].clusters[
        clusterResult.cluster['id']
    ].hashes[digestManageKey] = ['manage']
    config.hosts[config['baseUrl']].clusters[
        clusterResult.cluster['id']
    ].hashes[digestViewKey] = ['view']
    config.hosts[config['baseUrl']].clusters[
        clusterResult.cluster['id']
    ].hashes[digestCertificate] = []
    config['certificates'][digestCertificate] = {
        data: await serializeToBase64(privateKey),
        note: 'initial certificate',
    }
    config.tokens[digestManageKey] = {
        data: manage_keyb64,
        note: 'initial token',
    }
    config.tokens[digestViewKey] = {
        data: view_keyb64,
        note: 'recovery token',
    }
    if (!cleanConfig(config)) {
        throw Error('invalid config created')
    }
    let testhash = await hashObject(
        config['certificates'][digestCertificate].data,
        hashAlgorithm
    )
    /**if (testhash != digestCertificate) {
        console.log('diff between hashes', {
            testhash,
            digestCertificate,
            cert: config['certificates'][digestCertificate].data,
            hashAlgorithm,
        })
    }*/
    const digest = await sortedHash(['type=Config'], hashAlgorithm)

    const { tokens: authorization } = authInfoFromConfig({
        config: config,
        clusters: new Set([clusterResult.cluster['id']]),
        require: new Set(['manage']),
        url: config.baseUrl,
    })

    const { data: contentResult } = await createContent({
        client,
        config,
        cluster: clusterResult.cluster['id'],
        value: new Blob([JSON.stringify(config)]),
        pubkeys: [publicKey],
        privkeys: [privateKey],
        type: 'Config',
        state: 'internal',
        tags: ['name=config.json'],
        contentHash: digest,
        hashAlgorithm,
        authorization,
    })

    return {
        config,
        cluster: clusterResult,
        content: contentResult.updateOrCreateContent,
    }
}
