import { mapHashNames } from '../constants'
import * as Interfaces from '../interfaces'
import { serializeToBase64, unserializeToArrayBuffer } from './encoding'
import {
    encryptRSAOEAP,
    unserializeToCryptoKey,
    verifySignature,
} from './encryption'
import { hashKey } from './hashing'

// onlyPubkeys enforces checks which can fail in case of missing tag inclusion
// this is the case with the findConfigQuery
export function extractPubKeysCluster(props: {
    readonly node: any
    readonly authorization: string[]
    readonly params: any
    // can be used to boost speed; in case the key is already available it is used and not downloaded
    // if not onlySeen is specified, then source is merged
    readonly source?: { [hash: string]: Promise<CryptoKey> }
    readonly onlyPubkeys?: boolean
    readonly onlySeen?: boolean
}): { [hash: string]: Promise<CryptoKey> } {
    const pubkeys = Object.assign({}, props.source || {})
    const contents = props.node.cluster
        ? props.node.cluster.contents.edges
        : props.node.contents.edges
    const seen = new Set<string>()
    for (const { node: keyNode } of contents) {
        if (!props.onlyPubkeys && keyNode.type != 'PublicKey') {
            continue
        }
        const keyHash: string = keyNode.contentHash.replace(/^Key:/, '')
        seen.add(keyHash)
        if (!pubkeys[keyHash]) {
            pubkeys[keyHash] = fetch(keyNode.link, {
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
                    console.error(
                        'failed exctracting public key from cluster',
                        buf,
                        exc
                    )
                    throw exc
                }
            })
        } else {
            pubkeys[keyHash] = unserializeToCryptoKey(
                pubkeys[keyHash],
                props.params,
                'publicKey'
            )
        }
    }
    if (props.onlySeen) {
        for (const key of Object.keys(pubkeys)) {
            if (!seen.has(key)) {
                delete pubkeys[key]
            }
        }
    } else {
        // we need to convert the rest of source
        for (const key of Object.keys(pubkeys)) {
            if (!seen.has(key)) {
                pubkeys[key] = unserializeToCryptoKey(
                    pubkeys[key],
                    props.params,
                    'publicKey'
                )
            }
        }
    }
    return pubkeys
}

export async function verifyContent({
    config,
    content,
    existing,
    ...props
}: {
    readonly node: any
    existing?: { [hash: string]: Promise<CryptoKey> }
    readonly config: Interfaces.ConfigInterface
    readonly onlyPubkeys?: boolean
    readonly itemDomain: string
    readonly content: Blob
}): Promise<number> {
    // level is inverted 1 is max, 3 is lowest, 4 is helper for unverified
    let maxLevel = 4
    const ops = []
    for (const { node } of props.node.references.edges) {
        if (!props.onlyPubkeys && node.target.type == 'PublicKey') {
            continue
        }
        const keyHash: string = node.target.contentHash.replace(/^Key:/, '')
        const signature = node.extra
        let level = 3
        if (config.trustedKeys[keyHash]) {
            level = config.trustedKeys[keyHash].level
        }
        if (!existing || !existing[keyHash]) {
            const fn = async () => {
                const result = await fetch(
                    new URL(node.target.link, props.itemDomain)
                )
                if (!result.ok) {
                    return
                }
                const pubKeyBlob = await result.arrayBuffer()
                if (await verifySignature(pubKeyBlob, signature, content)) {
                    // level is inverted
                    if (maxLevel > level) {
                        maxLevel = level
                    }
                }
            }
            ops.push(fn())
        } else {
            const fn = async () => {
                if (
                    await verifySignature(existing[keyHash], signature, content)
                ) {
                    // level is inverted
                    if (maxLevel > level) {
                        maxLevel = level
                    }
                }
            }
            ops.push(fn())
        }
    }
    await Promise.allSettled(ops)
    return maxLevel
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

        // serialize to spki of publickey for consistent hash
        const result = await hashKey(signkey, hashalgo)
        hash = result.hash
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
    let pubkey: CryptoKey, hash: string
    if ((_x as any)['hash']) {
        pubkey = (_x as Interfaces.CryptoHashPair).key
        hash = (_x as Interfaces.CryptoHashPair).hash
    } else {
        const result = await hashKey(key as Interfaces.KeyInput, '' + hashalgo)
        pubkey = result.publicKey
        hash = result.hash
    }
    return {
        encrypted: await encryptRSAOEAP({
            key: pubkey,
            data: sharedkey,
            hashAlgorithm: hashalgo,
        }).then((data) => serializeToBase64(data.data)),
        hash,
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
            val.filter((val) => val)
        ) as Promise<Interfaces.ReferenceInterface[]>,
        Promise.all(tags),
    ]
}
