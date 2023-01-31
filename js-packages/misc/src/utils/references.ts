import { mapHashNames, trusted_states } from '../constants'
import * as Interfaces from '../interfaces'
import { serializeToBase64, unserializeToArrayBuffer } from './encoding'
import {
    encryptRSAOEAP,
    unserializeToCryptoKey,
    verifySignature,
} from './encryption'
import { hashKey, hashObject } from './hashing'

export async function extractGroupKeys({
    serverConfig,
    hashAlgorithm,
    itemDomain,
}: {
    serverConfig: {
        groups: {
            name: string
            injectedKeys: {
                link: string
                contentHash: string
            }[]
        }[]
    }
    readonly hashAlgorithm: string
    readonly itemDomain: string
}): Promise<{
    [name: string]: { [hash: string]: Promise<CryptoKey> }
}> {
    const mapItem = mapHashNames['' + hashAlgorithm]
    if (!mapItem) {
        throw new Error(
            'Invalid hash algorithm/no hash algorithm specified: ' +
                hashAlgorithm
        )
    }
    const prefix = `Key:${mapItem.serializedName}`
    const groupsMapping: {
        [name: string]: { [hash: string]: Promise<CryptoKey> }
    } = {}
    const seenKeys: { [link: string]: [string, Promise<CryptoKey>] } = {}
    for (const groupNode of serverConfig.groups) {
        if (groupNode.injectedKeys.length) {
            const keys: { [hash: string]: Promise<CryptoKey> } = {}
            for (const keyNode of groupNode.injectedKeys) {
                const isInSeenKeys = seenKeys[keyNode.link] ? false : true
                let [key_hash, key]: [string, Promise<CryptoKey>] = isInSeenKeys
                    ? seenKeys[keyNode.link]
                    : [
                          '',
                          fetch(new URL(keyNode.link, itemDomain)).then(
                              async (result) => {
                                  const buf = await result.arrayBuffer()
                                  try {
                                      return await unserializeToCryptoKey(
                                          buf,
                                          {
                                              name: 'RSA-OAEP',
                                              hash: mapItem.operationName,
                                          },
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
                              }
                          ),
                      ]
                if (!key_hash.length) {
                    if (keyNode.contentHash.startsWith(prefix)) {
                        key_hash = keyNode.contentHash.replace(/^Key:/, '')
                    } else {
                        try {
                            key_hash = await hashObject(
                                key,
                                mapItem.serializedName
                            )
                        } catch {}
                    }
                }
                if (key_hash.length) {
                    if (!isInSeenKeys) {
                        seenKeys[keyNode.link] = [key_hash, key]
                    }
                    keys[key_hash] = key
                }
            }
            groupsMapping[groupNode.name] = keys
        }
    }
    return groupsMapping
}

// validateKey enforces checks which can fail in case of missing tag inclusion
// this is the case with the findConfigQuery
export function extractPubKeysClusterAndInjected({
    validateKey = true,
    groupKeys,
    ...props
}: {
    readonly node: any
    readonly authorization: string[]
    readonly hashAlgorithm: string
    readonly itemDomain: string
    // can be used to boost speed; in case the key is already available it is used and not downloaded
    // if not onlySeen is specified, then source is merged
    readonly source?: { [hash: string]: Promise<CryptoKey> }
    readonly validateKey?: boolean
    readonly onlySeen?: boolean
    readonly onlyExtraAndRequired?: Set<string>
    readonly groupKeys: {
        [name: string]: { [hash: string]: Promise<CryptoKey> }
    }
}): { [hash: string]: Promise<CryptoKey> } {
    const mapItem = mapHashNames['' + props.hashAlgorithm]
    if (!mapItem) {
        throw new Error(
            'Invalid hash algorithm/no hash algorithm specified: ' +
                props.hashAlgorithm
        )
    }
    const pubkeys = Object.assign({}, props.source || {})
    const contents = props.node.cluster
        ? props.node.cluster.contents.edges
        : props.node.contents.edges
    const seen = new Set<string>()
    for (const group of props.node.groups) {
        const mObject = groupKeys[group]
        if (mObject) {
            for (const entry of Object.entries(mObject)) {
                pubkeys[entry[0]] = entry[1]
            }
        }
    }
    for (const { node: keyNode } of contents) {
        if (
            validateKey &&
            (keyNode.type != 'PublicKey' || !trusted_states.has(keyNode.state))
        ) {
            continue
        }
        let mainKeyHash: string | undefined = undefined
        let valid = false
        let hashes: string[] = []
        for (const tag of keyNode.tags as string[]) {
            if (tag.startsWith('key_hash=')) {
                const key_hash = tag.replace(/^key_hash=/, '')
                if (key_hash.startsWith(mapItem.serializedName)) {
                    mainKeyHash = key_hash
                }
                hashes.push(key_hash)
                if (
                    !props.onlyExtraAndRequired ||
                    keyNode.state == 'required' ||
                    props.onlyExtraAndRequired.has(key_hash)
                ) {
                    valid = true
                }
            }
        }
        if (!valid || !mainKeyHash) {
            continue
        }
        for (const key in hashes) {
            seen.add(key)
        }

        if (!pubkeys[mainKeyHash]) {
            pubkeys[mainKeyHash] = fetch(
                new URL(keyNode.link, props.itemDomain),
                {
                    headers: {
                        Authorization: props.authorization.join(','),
                    },
                }
            ).then(async (result) => {
                const buf = await result.arrayBuffer()
                try {
                    return await unserializeToCryptoKey(
                        buf,
                        {
                            name: 'RSA-OAEP',
                            hash: mapItem.operationName,
                        },
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
            pubkeys[mainKeyHash] = unserializeToCryptoKey(
                pubkeys[mainKeyHash],
                {
                    name: 'RSA-OAEP',
                    hash: mapItem.operationName,
                },
                'publicKey'
            )
        }
    }
    if (props.source && Object.keys(props.source).length) {
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
                        {
                            name: 'RSA-OAEP',
                            hash: mapItem.operationName,
                        },
                        'publicKey'
                    )
                }
            }
        }
    }
    return pubkeys
}

// for private keys we don't want to encrypt them for all other public keys
// so only encrypt for the keys found in references
export function extractPubKeysReferences({
    validateKey,
    ...props
}: {
    readonly node: any
    readonly authorization: string[]
    readonly source?: { [hash: string]: Promise<CryptoKey> }
    readonly validateKey?: boolean
    readonly onlySeen?: boolean
    readonly hashAlgorithm: string
}): { [hash: string]: Promise<CryptoKey> } {
    const pubkeys = Object.assign({}, props.source || {})
    const seen = new Set<string>()
    const mapItem = mapHashNames['' + props.hashAlgorithm]
    if (!mapItem) {
        throw new Error(
            'Invalid hash algorithm/no hash algorithm specified: ' +
                props.hashAlgorithm
        )
    }
    for (const {
        node: { target: keyNode },
    } of props.node.references.edges) {
        if (
            validateKey &&
            (keyNode.type != 'PublicKey' || !trusted_states.has(keyNode.state))
        ) {
            continue
        }
        let mainKeyHash: string | undefined = undefined
        for (const tag of keyNode.tags as string[]) {
            if (tag.startsWith('key_hash=')) {
                const key_hash = tag.replace(/^key_hash=/, '')
                if (key_hash.startsWith(mapItem.serializedName)) {
                    mainKeyHash = key_hash
                }
                seen.add(key_hash)
            }
        }
        if (!mainKeyHash) {
            continue
        }
        if (!pubkeys[mainKeyHash]) {
            pubkeys[mainKeyHash] = fetch(keyNode.link, {
                headers: {
                    Authorization: props.authorization.join(','),
                },
            }).then(async (result) => {
                const buf = await result.arrayBuffer()
                try {
                    return await unserializeToCryptoKey(
                        buf,

                        {
                            name: 'RSA-OAEP',
                            hash: mapItem.operationName,
                        },
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
        } else {
            pubkeys[mainKeyHash] = unserializeToCryptoKey(
                pubkeys[mainKeyHash],
                {
                    name: 'RSA-OAEP',
                    hash: mapItem.operationName,
                },
                'publicKey'
            )
        }
    }
    if (props.source && Object.keys(props.source).length) {
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
                        {
                            name: 'RSA-OAEP',
                            hash: mapItem.operationName,
                        },
                        'publicKey'
                    )
                }
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
