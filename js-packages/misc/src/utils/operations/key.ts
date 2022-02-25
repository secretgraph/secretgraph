import { ApolloClient, FetchResult } from '@apollo/client'
import {
    createKeysMutation,
    findConfigQuery,
    updateContentMutation,
    updateKeyMutation,
} from '@secretgraph/graphql-queries/content'

import { mapHashNames } from '../../constants'
import * as Interfaces from '../../interfaces'
import {
    encryptAESGCM,
    encryptTag,
    serializeToBase64,
    unserializeToArrayBuffer,
    unserializeToCryptoKey,
} from '../encryption'
import { createSignatureReferences, encryptSharedKey } from '../graphql'

export async function createKeys({
    client,
    cluster,
    privateKey,
    pubkeys,
    publicState = 'public',
    ...options
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    cluster: string
    privateKey?: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>
    publicKey: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>
    pubkeys?: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    privateTags?: Iterable<string | PromiseLike<string>>
    publicTags?: Iterable<string | PromiseLike<string>>
    publicState?: string
    contentHash?: string | null
    privateActions?: Iterable<Interfaces.ActionInterface>
    publicActions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    authorization: Iterable<string>
}): Promise<FetchResult<any>> {
    const nonce = crypto.getRandomValues(new Uint8Array(13))
    const key = crypto.getRandomValues(new Uint8Array(32))
    const halgo = mapHashNames[options.hashAlgorithm]

    const keyParams = {
        name: 'RSA-PSS',
        hash: halgo.operationName,
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
          }).then((data) => new Blob([data.data]))
        : null

    if (!pubkeys) {
        pubkeys = []
    }

    const [[specialRef, ...references], privateTags] = await Promise.all(
        encryptSharedKey(
            key,
            ([publicKey] as Parameters<typeof encryptSharedKey>[1]).concat(
                pubkeys
            ),
            halgo.operationName
        )
    )
    privateTags.push(`key=${specialRef.extra}`)
    const signatureReferencesPromise = createSignatureReferences(
        publicKey,
        options.privkeys ? options.privkeys : [],
        halgo.operationName
    )
    if (options.privateTags) {
        privateTags.push(...(await Promise.all(options.privateTags)))
    }
    const publicTags: string[] = options.publicTags
        ? await Promise.all(options.publicTags)
        : []
    return await client.mutate({
        mutation: createKeysMutation,
        // we need a current updateId
        awaitRefetchQueries: true,
        variables: {
            cluster,
            references: references.concat(await signatureReferencesPromise),
            privateTags,
            publicTags,
            publicState,
            nonce: await serializeToBase64(nonce),
            publicKey: new Blob([await unserializeToArrayBuffer(publicKey)]),
            privateKey: await encryptedPrivateKeyPromise,
            privateActions: options.privateActions
                ? [...options.privateActions]
                : undefined,
            publicActions: options.publicActions
                ? [...options.publicActions]
                : undefined,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: options.authorization,
        },
    })
}

export async function updateKey({
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
    key?: CryptoKey | PromiseLike<CryptoKey> // key or key data
    pubkeys?: Parameters<typeof encryptSharedKey>[1]
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
    const updatedKey = await options.key
    const tags = options.tags
        ? await Promise.all(options.tags)
        : updatedKey
        ? []
        : null
    const encrypt: Set<string> | undefined = options.encryptTags
        ? new Set(options.encryptTags)
        : undefined
    let sharedKey: ArrayBuffer | undefined
    if (updatedKey && updatedKey.type == 'private') {
        sharedKey = crypto.getRandomValues(new Uint8Array(32))
    } else if (options.tags && encrypt && encrypt.size > 0) {
        if (!options.oldKey) {
            throw Error('Tag only update without oldKey')
        }
        sharedKey = await unserializeToArrayBuffer(options.oldKey)
    } else {
        sharedKey = undefined
    }
    let completedKey = null
    let nonce = undefined
    if (updatedKey && updatedKey.type == 'private') {
        nonce = crypto.getRandomValues(new Uint8Array(13))
        if (!options.hashAlgorithm) {
            throw Error('hashAlgorithm required for key updates')
        }
        if (!options.pubkeys || options.pubkeys.length == 0) {
            throw Error('No public keys provided')
        }
        completedKey = await encryptAESGCM({
            key: sharedKey as ArrayBuffer,
            nonce,
            data: updatedKey,
        })

        const [[specialRef, ...publicKeyReferences], privateTags] =
            await Promise.all(
                encryptSharedKey(
                    sharedKey as ArrayBuffer,
                    (
                        [updatedKey] as Parameters<typeof encryptSharedKey>[1]
                    ).concat(options.pubkeys),
                    options.hashAlgorithm
                )
            )
        ;(tags as string[]).push(`key=${specialRef.extra}`, ...privateTags)
        references = publicKeyReferences.concat(
            options.references ? [...options.references] : []
        )
    } else if (updatedKey && updatedKey.type == 'public') {
        if (!options.hashAlgorithm) {
            throw Error('hashAlgorithm required for key resigning')
        }
        completedKey = { data: await unserializeToArrayBuffer(updatedKey) }
        const signatureReferencesPromise = createSignatureReferences(
            updatedKey,
            options.privkeys ? options.privkeys : [],
            options.hashAlgorithm
        )
        references = (await signatureReferencesPromise).concat(
            options.references ? [...options.references] : []
        )
    } else {
        references = options.references ? options.references : null
    }

    return await client.mutate({
        // we need a current updateId
        awaitRefetchQueries: true,
        mutation: updateKeyMutation,
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
            key: completedKey ? new Blob([completedKey.data]) : null,
            actions: options.actions ? [...options.actions] : null,
            contentHash: options.contentHash ? options.contentHash : null,
            authorization: [...options.authorization],
        },
    })
}
