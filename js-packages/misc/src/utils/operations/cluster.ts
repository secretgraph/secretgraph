import { ApolloClient, FetchResult } from '@apollo/client'
import {
    createClusterMutation,
    updateClusterMutation,
} from '@secretgraph/graphql-queries/cluster'

import { mapHashNames } from '../../constants'
import * as Interfaces from '../../interfaces'
import { authInfoFromConfig, cleanConfig } from '../config'
import { serializeToBase64, unserializeToArrayBuffer } from '../encoding'
import { encryptAESGCM, encryptRSAOEAP } from '../encryption'
import { hashObject, hashTagsContentHash } from '../hashing'
import { createContent } from './content'

export async function createCluster(options: {
    client: ApolloClient<any>
    actions: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    net?: string
    name?: string
    description?: string
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
            net: options.net,
            name: options.name,
            description: options.description,
            publicKey: await publicKeyPromise,
            privateKey: await privateKeyPromise,
            privateTags: privateTags,
            nonce: nonce ? await serializeToBase64(nonce) : null,
            actions: options.actions,
            authorization: options.authorization,
            featured: options.featured,
        },
    })
}

export async function updateCluster(options: {
    id: string
    client: ApolloClient<any>
    updateId: string
    actions?: Interfaces.ActionInterface[]
    featured?: boolean
    net?: string
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
            net: options.net,
            updateId: options.updateId,
            name: options.name,
            description: options.description,
            actions: options.actions,
            authorization: options.authorization,
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
    net,
    slot,
    noteCertificate,
    noteToken,
    ...options
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    slot: string
    net?: string
    name?: string
    description?: string
    featured?: boolean
    hashAlgorithm: string
    noteToken: string
    noteCertificate: string
}) {
    const manage_key = crypto.getRandomValues(new Uint8Array(32))
    const view_key = crypto.getRandomValues(new Uint8Array(32))
    const { publicKey, privateKey } = (await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            //modulusLength: 8192,
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: mapHashNames[hashAlgorithm].operationName,
        },
        true,
        ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
    )) as Required<CryptoKeyPair>
    const manage_keyb64 = Buffer.from(manage_key).toString('base64')
    const view_keyb64 = Buffer.from(view_key).toString('base64')
    const digestPublicKey = await hashObject(publicKey, hashAlgorithm)
    const digestManageKey = await hashObject(manage_key, hashAlgorithm)
    const digestViewKey = await hashObject(view_key, hashAlgorithm)
    const clusterResponse = await createCluster({
        client,
        actions: [
            { value: '{"action": "manage"}', key: manage_keyb64 },
            {
                value: JSON.stringify({
                    action: 'view',
                    //for safety reasons include also PublicKey
                    includeTypes: ['PublicKey', 'PrivateKey', 'Config'],
                    includeTags: [
                        `key_hash=${digestPublicKey}`,
                        `slot=${slot}`,
                    ],
                }),
                key: view_keyb64,
            },
        ],
        name,
        net,
        description,
        hashAlgorithm,
        publicKey,
        privateKey,
        privateKeyKey: manage_key,
        ...options,
    })
    const clusterResult =
        clusterResponse.data.secretgraph.updateOrCreateCluster
    config.configCluster = clusterResult.cluster['id']
    config.hosts[config['baseUrl']].clusters[clusterResult.cluster['id']] = {
        hashes: {
            [digestManageKey]: ['manage'],
            [digestViewKey]: ['view'],
            [digestPublicKey]: [],
        },
    }
    config['certificates'][digestPublicKey] = {
        // private key is serialized
        data: await serializeToBase64(privateKey),
        note: noteCertificate,
        signWith: true,
    }
    config.tokens[digestManageKey] = {
        data: manage_keyb64,
        note: noteToken,
        system: false,
    }
    config.tokens[digestViewKey] = {
        data: view_keyb64,
        note: 'config token',
        system: true,
    }
    const keyUrl = new URL(
        clusterResult.cluster.contents.edges[0].node.link,
        config['baseUrl']
    )
    config.trustedKeys[digestPublicKey] = {
        links: [`${keyUrl}`],
        level: 1,
        note: 'created by user',
        lastChecked: Math.floor(Date.now() / 1000),
    }
    if (!cleanConfig(config)[0]) {
        throw Error('invalid config created')
    }
    const contentHash = await hashTagsContentHash(
        [`slot=${slot}`],
        'Config',
        hashAlgorithm
    )

    const { tokens: authorization } = authInfoFromConfig({
        config: config,
        clusters: new Set([clusterResult.cluster['id']]),
        require: new Set(['manage']),
        url: config.baseUrl,
    })
    if (!authorization.length) {
        throw new Error('no tokens found after initialization')
    }
    const { data: configResult } = await createContent({
        client,
        cluster: clusterResult.cluster['id'],
        value: new Blob([JSON.stringify(config)]),
        pubkeys: [publicKey],
        privkeys: [privateKey],
        type: 'Config',
        state: 'protected',
        tags: ['name=config.json', `slot=${slot}`],
        contentHash,
        hashAlgorithm,
        authorization,
    })

    return {
        config,
        clusterResult: clusterResult,
        configResult: configResult.secretgraph.updateOrCreateContent,
        pubkey: publicKey,
        signkey: privateKey,
        manageToken: manage_keyb64,
    }
}
