import { ApolloClient, FetchResult, useMutation } from '@apollo/client'
import {
    createContentMutation,
    updateContentMutation,
    transferMutation,
} from '@secretgraph/graphql-queries/content'

import { mapHashNames } from '../../constants'
import * as Constants from '../../constants'
import * as Interfaces from '../../interfaces'
import { findCertCandidatesForRefs } from '../config'
import {
    b64tobuffer,
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../encoding'
import {
    decryptAESGCM,
    decryptRSAOEAP,
    encryptAESGCM,
    finalizeTag,
    extractTags,
    extractTagsRaw,
} from '../encryption'
import { fallback_fetch } from '../misc'
import { createSignatureReferences, encryptSharedKey } from '../references'

export async function createContent({
    client,
    cluster,
    net,
    tags: tagsIntern,
    value,
    ...options
}: {
    client: ApolloClient<any>
    cluster: string
    net?: string
    type: string
    state: string
    value: Interfaces.CryptoGCMInInterface['data']
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys: Parameters<typeof createSignatureReferences>[1]
    tags: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    authorization: Iterable<string>
}): Promise<FetchResult<any>> {
    const tagsOptions = await Promise.all(tagsIntern)
    const isPublic = Constants.public_states.has(options.state)
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
                  console.error(
                      'encrypting content failed',
                      key,
                      nonce,
                      reason
                  )
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
                    finalizeTag({
                        data,
                        key: key as NonNullable<typeof key>,
                    })
                )
        )
    }
    return await client.mutate({
        mutation: createContentMutation,
        // we need a current updateId
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
                (data) =>
                    new Blob([data], { type: 'application/octet-stream' })
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
    // only for tag only updates if finalizeTags is used
    oldKey?: Interfaces.RawInput
}): Promise<FetchResult<any>> {
    const tagsOptions = options.tags
        ? await Promise.all(options.tags)
        : options.value
        ? []
        : null
    const isPublic = state ? Constants.public_states.has(state) : undefined
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
    if (!updateId) {
        throw Error('UpdateId required for update')
    }
    const references: Interfaces.ReferenceInterface[] = []
    let tags: (PromiseLike<string> | string)[] | null = tagsOptions
    if (sharedKey && tagsOptions && !isPublic) {
        tags = tagsOptions.map((tag: string) => {
            return finalizeTag({
                key: sharedKey as ArrayBuffer,
                data: tag,
            })
        })
    }
    let encryptedContent = null
    let nonce = undefined
    if (options.value) {
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
            const [publicKeyReferencesPromise, tagsPromise2] =
                encryptSharedKey(
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
        variables: {
            id,
            updateId,
            net,
            state,
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

class KeyMissmatchError extends Error {}
class TransferFailedError extends Error {}

interface decryptContentObjectInterface
    extends Omit<Interfaces.CryptoGCMOutInterface, 'nonce' | 'key'> {
    tags: { [tag: string]: string[] }
    updateId: string
    nodeData: any
}

interface decryptContentObjectInputDirect {
    config:
        | Interfaces.ConfigInterface
        | PromiseLike<Interfaces.ConfigInterface>
    nodeData: any | PromiseLike<any>
    blobOrTokens: Blob | string | PromiseLike<Blob | string>
}

interface decryptContentObjectInputFetch
    extends Omit<decryptContentObjectInputDirect, 'blobOrTokens'> {
    blobOrTokens: string[] | PromiseLike<string[]>
    itemDomain: string
    transferClient?: ApolloClient<any>
}

type decryptContentObjectInput =
    | decryptContentObjectInputDirect
    | decryptContentObjectInputFetch

export async function decryptContentObject({
    config: _config,
    nodeData,
    blobOrTokens,
    ...params
}: decryptContentObjectInput): Promise<decryptContentObjectInterface | null> {
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
        const params2 = params as decryptContentObjectInputFetch
        // if transfer, request transfer and load when successful
        let transfer_headers: { [key: string]: string } = {}
        let transfer_url = nodeData.tags.find(
            (value: string) =>
                value.startsWith('~transfer_url=') ||
                value.startsWith('transfer_url=')
        )
        if (params2.transferClient) {
            if (transfer_url && transfer_url.startsWith('~')) {
                let transfer_key, decrypted_tags
                try {
                    // also handles key= tags
                    const found = findCertCandidatesForRefs(
                        config,
                        _node,
                        'transfer'
                    )
                    if (!found.length) {
                        console.debug('No certificate tag found')
                        return null
                    }
                    // find key (=first result of decoding shared key)
                    transfer_key = (
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
                decrypted_tags = await extractTags({
                    key: transfer_key,
                    tags: nodeData.tags,
                })
                transfer_url = decrypted_tags['~transfer_url'][0]
                transfer_headers = Object.fromEntries(
                    (decrypted_tags['~transfer_headers']
                        ? decrypted_tags['~transfer_headers']
                        : []
                    )
                        .map((value: string) =>
                            value.match(/^([^=]+)=(.+)/)?.slice(1)
                        )
                        .filter((value: any) => value) as [string, string][]
                )
            } else if (transfer_url) {
                // unencrypted
                let decrypted_tags = await extractTagsRaw({
                    tags: nodeData.tags,
                })
                transfer_url = decrypted_tags['transfer_url'][0]
                transfer_headers = Object.fromEntries(
                    (decrypted_tags['transfer_headers']
                        ? decrypted_tags['transfer_headers']
                        : []
                    )
                        .map((value: string) =>
                            value.match(/^([^=]+)=(.+)/)?.slice(1)
                        )
                        .filter((value: any) => value) as [string, string][]
                )
            }
            if (transfer_url) {
                const result = await params2.transferClient.mutate({
                    mutation: transferMutation,
                    variables: {
                        id: nodeData.id,
                        url: transfer_url,
                        headers: transfer_headers,
                        authorization: _info,
                    },
                })
                if (!result.data?.secretgraph?.transferContent?.content?.id) {
                    throw new TransferFailedError()
                }
            }
        }
        if (transfer_url && params2.transferClient) {
            arrPromise = fetch(new URL(_node.link, params2.itemDomain), {
                headers: {
                    Authorization: _info.join(','),
                },
                cache: 'no-cache',
                credentials: 'omit',
                mode: 'no-cors',
            }).then((result) => result.arrayBuffer())
        } else {
            if (transfer_url) {
                console.warn(
                    'transfer object found where transfers are disallowed'
                )
            }
            arrPromise = fallback_fetch(
                new URL(_node.link, params2.itemDomain),
                {
                    headers: {
                        Authorization: _info.join(','),
                    },
                }
            ).then((result) => result.arrayBuffer())
        }
    }

    // skip decryption as always unencrypted
    if (_node.type == 'PublicKey' || _node.state == 'public') {
        return {
            data: await arrPromise,
            tags: await extractTagsRaw({
                tags: nodeData.tags,
            }),
            updateId: nodeData.updateId,
            nodeData,
        }
    }
    let key
    try {
        // also handles key= tags
        const found = findCertCandidatesForRefs(config, _node, 'key')
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
            tags: await extractTags({ key, tags: nodeData.tags }),
            updateId: nodeData.updateId,
            nodeData,
        }
    } catch (exc) {
        // console.debug('Decoding content failed', exc)
        throw new KeyMissmatchError(
            "Encrypted content and shared key doesn't match"
        )
    }
}
