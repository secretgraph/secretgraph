import { ApolloClient, InMemoryCache } from '@apollo/client'
import { relayStylePagination } from '@apollo/client/utilities'
import { createUploadLink } from 'apollo-upload-client'

import { mapHashNames } from '../constants'
import * as Interfaces from '../interfaces'
import {
    encryptRSAOEAP,
    serializeToBase64,
    unserializeToArrayBuffer,
    unserializeToCryptoKey,
} from './encryption'

declare var __DEV__: any

export const createClient = (url: string) => {
    return new ApolloClient({
        connectToDevTools: __DEV__ ?? false,
        cache: new InMemoryCache({
            typePolicies: {
                ActionEntry: {
                    merge: false,
                },
                Content: {
                    fields: {
                        availableActions: {
                            merge: false,
                        },
                    },
                },
                Cluster: {
                    fields: {
                        availableActions: {
                            merge: false,
                        },
                    },
                },
                SecretgraphObject: {
                    queryType: true,
                    fields: {
                        clusters: relayStylePagination([
                            'includeTags',
                            'excludeTags',
                            'contentHashes',
                            'user',
                            'public',
                            'featured',
                            'deleted',
                            'minUpdated',
                            'maxUpdated',
                        ]),
                        contents: relayStylePagination([
                            'includeTags',
                            'excludeTags',
                            'contentHashes',
                            'public',
                            'deleted',
                            'minUpdated',
                            'maxUpdated',
                        ]),
                    },
                },
            },
        }),
        link: createUploadLink({
            uri: url,
        }),
        name: 'secretgraph',
        version: '0.1',
        queryDeduplication: !(__DEV__ ?? false),
        defaultOptions: {
            watchQuery: {
                fetchPolicy: 'cache-and-network',
            },
        },
    })
}

async function createSignatureReferences_helper(
    key:
        | Interfaces.KeyInput
        | Interfaces.CryptoHashPair
        | PromiseLike<Interfaces.KeyInput | Interfaces.CryptoHashPair>,
    hashalgo: string,
    content: ArrayBuffer | PromiseLike<ArrayBuffer>
) {
    const _x = await key
    let signkey: Interfaces.KeyInput, hash: string | Promise<string>
    const hashalgo2 = mapHashNames[hashalgo].operationName
    const hashalgo2_len = mapHashNames[hashalgo].length
    if ((_x as any)['hash']) {
        signkey = (_x as Interfaces.CryptoHashPair).key
        hash = (_x as Interfaces.CryptoHashPair).hash
    } else {
        signkey = key as Interfaces.KeyInput
        // serialize to spki for consistent hash
        hash = serializeToBase64(
            crypto.subtle.digest(
                hashalgo2,
                await crypto.subtle.exportKey(
                    'spki' as const,
                    await unserializeToCryptoKey(
                        key as Interfaces.KeyInput,
                        {
                            name: 'RSA-OAEP',
                            hash: hashalgo2,
                        },
                        'publicKey'
                    )
                )
            )
        )
    }

    return {
        signature: await serializeToBase64(
            crypto.subtle.sign(
                {
                    name: 'RSA-PSS',
                    saltLength: hashalgo2_len / 8,
                },
                await unserializeToCryptoKey(
                    signkey,
                    {
                        name: 'RSA-PSS',
                        hash: hashalgo2,
                    },
                    'privateKey'
                ),
                await content
            )
        ),
        hash: await hash,
    }
}

export async function createSignatureReferences(
    content: Parameters<typeof unserializeToArrayBuffer>[0],
    privkeys: (
        | Interfaces.KeyInput
        | Interfaces.CryptoHashPair
        | PromiseLike<Interfaces.KeyInput | Interfaces.CryptoHashPair>
    )[],
    hashalgo: string
): Promise<Interfaces.ReferenceInterface[]> {
    const references: Promise<Interfaces.ReferenceInterface>[] = []
    const hashValue = mapHashNames[hashalgo]
    if (!hashValue) {
        throw Error('hashalgorithm not supported: ' + hashalgo)
    }
    for (const privKey of privkeys) {
        references.push(
            createSignatureReferences_helper(
                privKey,
                hashalgo,
                unserializeToArrayBuffer(content)
            ).then(({ signature, hash }): Interfaces.ReferenceInterface => {
                return {
                    target: hash,
                    group: 'signature',
                    extra: `${hashValue.serializedName}:${signature}`,
                    deleteRecursive: 'FALSE',
                }
            })
        )
    }

    return await Promise.all(references)
}

async function encryptSharedKey_helper(
    key:
        | Interfaces.KeyInput
        | Interfaces.CryptoHashPair
        | PromiseLike<Interfaces.KeyInput | Interfaces.CryptoHashPair>,
    hashalgo: string | undefined,
    sharedkey: ArrayBuffer
) {
    const _x = await key
    let pubkey: CryptoKey | Promise<CryptoKey>, hash: string | Promise<string>
    if ((_x as any)['hash']) {
        pubkey = (_x as Interfaces.CryptoHashPair).key
        hash = (_x as Interfaces.CryptoHashPair).hash
    } else {
        const operationName = mapHashNames['' + hashalgo].operationName
        if (!operationName) {
            throw new Error(
                'Invalid hash algorithm/no hash algorithm specified and no CryptoHashPair provided: ' +
                    hashalgo
            )
        }
        pubkey = unserializeToCryptoKey(
            key as Interfaces.KeyInput,
            {
                name: 'RSA-OAEP',
                hash: operationName,
            },
            'publicKey'
        )
        hash = serializeToBase64(
            crypto.subtle.digest(
                operationName,
                await crypto.subtle.exportKey('spki' as const, await pubkey)
            )
        )
    }
    return {
        encrypted: await encryptRSAOEAP({
            key: pubkey,
            data: sharedkey,
            hashAlgorithm: hashalgo,
        }).then((data) => serializeToBase64(data.data)),
        hash: await hash,
    }
}

export function encryptSharedKey(
    sharedkey: ArrayBuffer,
    pubkeys: (
        | Interfaces.KeyInput
        | Interfaces.CryptoHashPair
        | PromiseLike<Interfaces.KeyInput | Interfaces.CryptoHashPair>
    )[],
    hashalgo?: string
): [Promise<Interfaces.ReferenceInterface[]>, Promise<string[]>] {
    const references: PromiseLike<Interfaces.ReferenceInterface | void>[] = []
    const tags: PromiseLike<string>[] = []
    const hashValue = mapHashNames['' + hashalgo]
    if (!hashValue) {
        throw Error('hashalgorithm not supported: ' + hashalgo)
    }
    for (const pubkey of pubkeys) {
        const temp = encryptSharedKey_helper(pubkey, hashalgo, sharedkey)
        references.push(
            temp.then(
                ({ encrypted, hash }): Interfaces.ReferenceInterface => {
                    return {
                        target: hash,
                        group: 'key',
                        extra: `${hashValue.serializedName}:${encrypted}`,
                        deleteRecursive: 'NO_GROUP',
                    }
                },
                async (reason) => {
                    console.error('failed PublicKey', (await temp).hash, reason)
                }
            )
        )
        tags.push(temp.then(({ hash }): string => `key_hash=${hash}`))
    }
    return [
        Promise.all(references).then((val) =>
            val.filter((vl) => vl)
        ) as Promise<Interfaces.ReferenceInterface[]>,
        Promise.all(tags),
    ]
}

// onlyPubkeys skips checks which can fail in case of missing tag inclusion
// this is the case with the findConfigQuery
export function extractPubKeysCluster(props: {
    readonly node: any
    readonly authorization: string[]
    readonly params: any
    old?: { [hash: string]: Promise<CryptoKey> }
    readonly onlyPubkeys?: boolean
}): { [hash: string]: Promise<CryptoKey> } {
    const pubkeys = props.old || {}
    const contents = props.node.cluster
        ? props.node.cluster.contents.edges
        : props.node.contents.edges
    for (const { node: keyNode } of contents) {
        if (!props.onlyPubkeys && keyNode.type != 'PublicKey') {
            continue
        }
        if (!pubkeys[keyNode.contentHash]) {
            pubkeys[keyNode.contentHash] = fetch(keyNode.link, {
                headers: {
                    Authorization: props.authorization.join(','),
                },
            }).then(async (result) => {
                const buf = await result.arrayBuffer()
                try {
                    return await unserializeToCryptoKey(
                        buf,
                        props.params,
                        'publicKey'
                    )
                } catch (exc) {
                    console.log(
                        'failed exctracting public key from cluster',
                        buf
                    )
                    throw exc
                }
            })
        }
    }
    return pubkeys
}

export function extractPubKeysReferences(props: {
    readonly node: any
    readonly authorization: string[]
    readonly params: any
    old?: { [hash: string]: Promise<CryptoKey> }
    readonly onlyPubkeys?: boolean
}): { [hash: string]: Promise<CryptoKey> } {
    const pubkeys = props.old || {}
    for (const {
        node: { target: keyNode },
    } of props.node.references.edges) {
        if (!props.onlyPubkeys && keyNode.type == 'PublicKey') {
            continue
        }
        if (!pubkeys[keyNode.contentHash]) {
            pubkeys[keyNode.contentHash] = fetch(keyNode.link, {
                headers: {
                    Authorization: props.authorization.join(','),
                },
            }).then(async (result) => {
                const buf = await result.arrayBuffer()
                try {
                    return await unserializeToCryptoKey(
                        buf,
                        props.params,
                        'publicKey'
                    )
                } catch (exc) {
                    console.log(
                        'failed exctracting public key from reference',
                        buf
                    )
                    throw exc
                }
            })
        }
    }
    return pubkeys
}
