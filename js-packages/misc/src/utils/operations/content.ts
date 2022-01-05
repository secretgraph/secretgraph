import { ApolloClient, FetchResult } from '@apollo/client'
import {
    createContentMutation,
    findConfigQuery,
    updateContentMutation,
} from '@secretgraph/graphql-queries/content'

import { mapHashNames } from '../../constants'
import * as Interfaces from '../../interfaces'
import {
    cleanConfig,
    extractAuthInfo,
    extractPrivKeys,
    findCertCandidatesForRefs,
    updateConfig,
} from '../config'
import {
    decryptAESGCM,
    decryptRSAOEAP,
    encryptAESGCM,
    encryptTag,
    extractTags,
    findWorkingHashAlgorithms,
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../encryption'
import {
    createSignatureReferences,
    encryptSharedKey,
    extractPubKeysReferences,
} from '../graphql'
import { b64toarr } from '../misc'

export async function createContent({
    client,
    cluster,
    tags: tagsIntern,
    value,
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
    const tagsOptions = await Promise.all(tagsIntern)
    const isPublic = tagsOptions.includes('state=public')

    const encryptedContentPromise = isPublic
        ? unserializeToArrayBuffer(value).then((data) => ({
              data,
          }))
        : encryptAESGCM({
              key,
              nonce,
              data: value,
          }).catch((reason) => {
              console.error('encrypting content failed', key, nonce, reason)
              return Promise.reject(reason)
          })
    const halgo = mapHashNames[options.hashAlgorithm].operationName

    const [publicKeyReferencesPromise, tagsPromise] = isPublic
        ? [[], []]
        : encryptSharedKey(key, options.pubkeys, halgo)
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
            .concat(tagsOptions)
            .map((data) => encryptTag({ data, key, encrypt }))
    )
    return await client.mutate({
        mutation: createContentMutation,
        // we need a current updateId
        awaitRefetchQueries: true,
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

// TODO: fix public/private. Don't encrypt if public
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
        // we need a current updateId
        awaitRefetchQueries: true,
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
        arrPromise = Promise.resolve(b64toarr(_info).buffer)
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
    if (
        _node.tags.some((val: string) =>
            ['type=PublicKey', 'state=public'].includes(val)
        )
    ) {
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
        console.debug('No matching certificate found', exc, exc?.errors)
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
            updateId: nodeData.updateId,
            tags: await extractTags({ key, tags: nodeData.tags, decrypt }),
            nodeData,
        }
    } catch (exc) {
        console.debug('Decoding content failed', exc)
        throw Error("Encrypted content and shared key doesn't match")
    }
}

export async function updateConfigRemoteReducer(
    state: Interfaces.ConfigInterface | null,
    {
        update,
        authInfo,
        client,
        nullonnoupdate,
    }: {
        update: Interfaces.ConfigInputInterface | null
        client: ApolloClient<any>
        authInfo?: Interfaces.AuthInfoInterface
        nullonnoupdate?: boolean
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
    const config = state || resconf[0]
    if (!authInfo) {
        authInfo = extractAuthInfo({
            config,
            url: config.baseUrl,
            clusters: new Set([config.configCluster]),
            require: new Set(['update', 'manage']),
        })
    }
    let privkeys = undefined
    let pubkeys = undefined

    while (true) {
        const configQueryRes = await client.query({
            query: findConfigQuery,
            variables: {
                cluster: config.configCluster,
                authorization: authInfo.tokens,
            },
            // but why? should be updated by cache updates (for this no-cache is required in config content updates)
            fetchPolicy: 'network-only',
        })
        if (configQueryRes.errors) {
            throw configQueryRes.errors
        }
        const node = configQueryRes.data.secretgraph.contents.edges[0]?.node
        if (!node) {
            throw Error('could not find config object')
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
            return foundConfig
        }
        if (!cleanConfig(mergedConfig)) {
            throw Error('invalid merged config')
        }
        const algos = findWorkingHashAlgorithms(
            configQueryRes.data.secretgraph.config.hashAlgorithms
        )
        privkeys = extractPrivKeys({
            config: mergedConfig,
            url: mergedConfig.baseUrl,
            hashAlgorithm: algos[0],
            old: privkeys,
        })
        pubkeys = extractPubKeysReferences({
            node,
            authorization: authInfo.tokens,
            params: {
                name: 'RSA-OAEP',
                hash: algos[0],
            },
            old: pubkeys,
            onlyPubkeys: true,
        })
        // updates cache
        const result = await updateContent({
            client,
            id: node.id,
            updateId: node.updateId,
            privkeys: Object.values(privkeys),
            pubkeys: Object.values(pubkeys),
            tags: ['type=Config', 'state=internal'],
            config: mergedConfig,
            hashAlgorithm: algos[0],
            value: new Blob([JSON.stringify(mergedConfig)]),
            authorization: authInfo.tokens,
        })
        if (result.errors) {
            throw new Error(`Update failed: ${configQueryRes.errors}`)
        }
        if (result.data.updateOrCreateContent.writeok) {
            return mergedConfig
        }
    }
}
