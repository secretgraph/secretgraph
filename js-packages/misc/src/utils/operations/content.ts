import { ApolloClient, FetchResult, useMutation } from '@apollo/client'
import {
    createContentMutation,
    updateContentMutation,
    transferMutation,
} from '@secretgraph/graphql-queries/content'

import * as Constants from '../../constants'
import * as Interfaces from '../../interfaces'
import { findCertCandidatesForRefs } from '../config'
import {
    b64tobuffer,
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../encoding'
import { finalizeTag, extractTags, extractTagsRaw } from '../encryption'
import { fallback_fetch } from '../misc'
import { createSignatureReferences, encryptSharedKey } from '../references'
import { MaybePromise } from '../../typing'
import {
    DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM,
    DEFAULT_SIGNATURE_ALGORITHM,
    DEFAULT_SYMMETRIC_ENCRYPTION_ALGORITHM,
    decrypt,
    decryptString,
    encrypt,
    serializeEncryptionParams,
} from '../crypto'

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
    value: Parameters<typeof encrypt>[1]
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys: Parameters<typeof createSignatureReferences>[1]
    tags: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    asymmetricEncryptionAlgorithm?: string
    symmetricEncryptionAlgorithm?: string
    signatureAlgorithm?: string
    authorization: Iterable<string>
}): Promise<FetchResult<any>> {
    const tagsOptions = await Promise.all(tagsIntern)
    const isPublic = Constants.public_states.has(options.state)
    let key: Uint8Array | undefined
    if (isPublic) {
        key = undefined
    } else {
        key = crypto.getRandomValues(new Uint8Array(32))
    }
    if (!isPublic && options.pubkeys.length == 0) {
        throw Error('No public keys provided')
    }

    const { data: finalizedContent, cryptoParameters } = await (isPublic
        ? unserializeToArrayBuffer(value).then((data) => {
              return { data, cryptoParameters: '' }
          })
        : encrypt(key as NonNullable<typeof key>, value, {
              algorithm:
                  options.symmetricEncryptionAlgorithm ||
                  DEFAULT_SYMMETRIC_ENCRYPTION_ALGORITHM,
          }).then(
              async (data) => {
                  return {
                      data: data.data,
                      cryptoParameters: await serializeEncryptionParams(data),
                  }
              },
              (reason) => {
                  console.error('encrypting content failed', key, reason)
                  throw reason
              }
          ))

    const [publicKeyReferencesPromise, tagsPromise] = isPublic
        ? [[], []]
        : encryptSharedKey(
              key as NonNullable<typeof key>,
              options.pubkeys,
              options.hashAlgorithm,
              options.asymmetricEncryptionAlgorithm ||
                  DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM
          )
    const signatureReferencesPromise = createSignatureReferences(
        finalizedContent,
        options.privkeys ? options.privkeys : [],
        options.hashAlgorithm,
        options.signatureAlgorithm || DEFAULT_SIGNATURE_ALGORITHM
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
                        symmetricEncryptionAlgorithm:
                            options.symmetricEncryptionAlgorithm ||
                            DEFAULT_SYMMETRIC_ENCRYPTION_ALGORITHM,
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
            cryptoParameters,
            value: new Blob([finalizedContent], {
                type: 'application/octet-stream',
            }),
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
    value?: Parameters<typeof encrypt>[1]
    pubkeys: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    tags?: Iterable<string | PromiseLike<string>>
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm?: string
    asymmetricEncryptionAlgorithm?: string
    symmetricEncryptionAlgorithm?: string
    signatureAlgorithm?: string
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
                symmetricEncryptionAlgorithm:
                    options.symmetricEncryptionAlgorithm ||
                    DEFAULT_SYMMETRIC_ENCRYPTION_ALGORITHM,
            })
        })
    }
    let finalizedContent = undefined
    let cryptoParameters = undefined
    if (options.value) {
        if (isPublic) {
            finalizedContent = await unserializeToArrayBuffer(options.value)
            cryptoParameters = ''

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
            const result = await encrypt(sharedKey, options.value, {
                algorithm:
                    options.symmetricEncryptionAlgorithm ||
                    DEFAULT_SYMMETRIC_ENCRYPTION_ALGORITHM,
            })
            finalizedContent = result.data
            cryptoParameters = await serializeEncryptionParams(result)

            const [publicKeyReferencesPromise, tagsPromise2] =
                encryptSharedKey(
                    sharedKey as ArrayBuffer,
                    options.pubkeys,
                    options.hashAlgorithm,
                    options.asymmetricEncryptionAlgorithm ||
                        DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM
                )
            references.push(...(await publicKeyReferencesPromise))
            tags.push(...(await tagsPromise2))
        }
        if (options.privkeys && options.privkeys.length) {
            references.push(
                ...(await createSignatureReferences(
                    finalizedContent,
                    options.privkeys,
                    options.hashAlgorithm as NonNullable<
                        typeof options.hashAlgorithm
                    >,
                    options.signatureAlgorithm as NonNullable<
                        typeof options.signatureAlgorithm
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
            cryptoParameters,
            value: finalizedContent
                ? new Blob([finalizedContent], {
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

interface decryptContentObjectInterface {
    data: ArrayBuffer
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
                                return await decryptString(
                                    config.certificates[value.hash].data,
                                    value.sharedKey
                                )
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
                    return await decryptString(
                        config.certificates[value.hash].data,
                        value.sharedKey
                    )
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
            ...(await decrypt(key, arrPromise, {
                params: _node.cryptoParameters,
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
