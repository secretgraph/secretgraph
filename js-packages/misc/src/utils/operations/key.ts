import { ApolloClient, FetchResult } from '@apollo/client'
import {
    createKeysMutation,
    updateKeyMutation,
} from '@secretgraph/graphql-queries/key'

import { encrypt } from '../crypto'
import * as Interfaces from '../../interfaces'
import { serializeToBase64, unserializeToArrayBuffer } from '../encoding'
import { finalizeTag } from '../encryption'
import { map } from '../iterable'
import { createSignatureReferences, encryptSharedKey } from '../references'
import { MaybePromise } from '../../typing'

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
    privateKey?: MaybePromise<string | ArrayBuffer | Blob>
    publicKey: MaybePromise<string | ArrayBuffer | Blob>
    pubkeys?: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    privateTags?: Iterable<string | PromiseLike<string>>
    publicTags?: Iterable<string | PromiseLike<string>>
    publicState?: string
    privateActions?: Iterable<Interfaces.ActionInterface>
    publicActions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm: string
    encryptionAlgorithm: string
    authorization: Iterable<string>
}): Promise<FetchResult<any>> {
    const nonce = crypto.getRandomValues(new Uint8Array(13))
    const sharedkey = crypto.getRandomValues(new Uint8Array(32))
    const encryptedPrivateKeyPromise = privateKey
        ? encrypt(sharedkey, unserializeToArrayBuffer(privateKey), {
              algorithm: 'AESGCM',
              params: { nonce },
          }).then((data) => new Blob([data.data]))
        : null

    if (!pubkeys) {
        pubkeys = []
    }

    const [[specialRef, ...references], privateTags] = await Promise.all(
        encryptSharedKey(
            sharedkey,
            (
                [options.publicKey] as Parameters<typeof encryptSharedKey>[1]
            ).concat(pubkeys),
            options.hashAlgorithm,
            options.encryptionAlgorithm
        )
    )
    privateTags.push(`key=${specialRef.extra}`)
    const publicKeyArray = await unserializeToArrayBuffer(options.publicKey)
    const signatureReferencesPromise = createSignatureReferences(
        publicKeyArray,
        options.privkeys ? options.privkeys : [],
        options.hashAlgorithm,
        options.hashAlgorithm
    )
    if (options.privateTags) {
        // only private tags can be encrypted
        privateTags.push(
            ...(
                await Promise.all(
                    map(
                        options.privateTags,
                        async (tag: string | Promise<string>) => {
                            return await finalizeTag({
                                key: sharedkey,
                                data: tag,
                            })
                        }
                    )
                )
            )
                // filter key= specifications from input options PrivateKey, we set it ourself with an newly generated random
                .filter((val) => !val.startsWith('key='))
        )
    }
    const publicTags: string[] = options.publicTags
        ? await Promise.all(options.publicTags)
        : []
    return await client.mutate({
        mutation: createKeysMutation,
        variables: {
            cluster,
            references: references.concat(await signatureReferencesPromise),
            publicTags,
            privateTags,
            publicState,
            nonce: await serializeToBase64(nonce),
            publicKey: new Blob([publicKeyArray]),
            privateKey: await encryptedPrivateKeyPromise,
            privateActions: options.privateActions
                ? [...options.privateActions]
                : undefined,
            publicActions: options.publicActions
                ? [...options.publicActions]
                : undefined,
            authorization: options.authorization,
        },
    })
}

export async function updateKey({
    id,
    updateId,
    client,
    publicState,
    net,
    ...options
}: {
    id: string
    updateId: string
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    net?: string
    // should be replaced
    key?: MaybePromise<CryptoKey> // key or key data
    pubkeys?: Parameters<typeof encryptSharedKey>[1]
    privkeys?: Parameters<typeof createSignatureReferences>[1]
    publicTags?: Iterable<string | PromiseLike<string>>
    privateTags?: Iterable<string | PromiseLike<string>>
    publicState?: string
    contentHash?: string | null
    references?: Iterable<Interfaces.ReferenceInterface> | null
    actions?: Iterable<Interfaces.ActionInterface>
    hashAlgorithm?: string
    encryptionAlgorithm?: string
    signatureAlgorithm?: string
    authorization: Iterable<string>
    oldKey?: Interfaces.RawInput
}): Promise<FetchResult<any>> {
    let references
    const updatedKey = await options.key
    let privateTags = options.privateTags
        ? await Promise.all(options.privateTags)
        : updatedKey
        ? []
        : undefined
    const publicTags: string[] | undefined = options.publicTags
        ? await Promise.all(options.publicTags)
        : undefined
    let hasEncrypted: boolean = false
    if (
        privateTags &&
        privateTags.findIndex((val) => val.startsWith('~')) >= 0
    ) {
        hasEncrypted = true
    }
    let sharedKey: ArrayBuffer | undefined
    if (updatedKey && updatedKey.type == 'private') {
        sharedKey = crypto.getRandomValues(new Uint8Array(32))
        // remove old encrypted shared key(s)
        if (privateTags && privateTags.length) {
            privateTags = privateTags.filter((val) => !val.startsWith('key='))
        }
    } else if (privateTags && hasEncrypted) {
        if (!options.oldKey) {
            throw Error('Tag only update with encrypted tags needs oldKey')
        }
        sharedKey = await unserializeToArrayBuffer(options.oldKey)
    } else {
        sharedKey = undefined
        if (
            privateTags &&
            privateTags.findIndex((val) => val.startsWith('key=')) < 0
        ) {
            throw Error('Tags are missing encrypted shared key (key=)')
        }
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
        completedKey = await encrypt(
            sharedKey as ArrayBuffer,
            unserializeToArrayBuffer(updatedKey),
            {
                params: { nonce },
                algorithm: 'AESGCM',
            }
        )

        const [[specialRef, ...publicKeyReferences], privateTags] =
            await Promise.all(
                encryptSharedKey(
                    sharedKey as ArrayBuffer,
                    (
                        [updatedKey] as Parameters<typeof encryptSharedKey>[1]
                    ).concat(options.pubkeys),
                    options.hashAlgorithm,
                    options.encryptionAlgorithm as string
                )
            )
        ;(privateTags as string[]).push(
            `key=${specialRef.extra}`,
            ...privateTags
        )
        references = publicKeyReferences.concat(
            options.references ? [...options.references] : []
        )
    } else if (updatedKey && updatedKey.type == 'public') {
        if (!options.hashAlgorithm) {
            throw Error('hashAlgorithm required for key resigning')
        }
        completedKey = { data: await unserializeToArrayBuffer(updatedKey) }
        const signatureReferencesPromise = createSignatureReferences(
            completedKey.data,
            options.privkeys ? options.privkeys : [],
            options.hashAlgorithm,
            options.signatureAlgorithm as string
        )
        references = (await signatureReferencesPromise).concat(
            options.references ? [...options.references] : []
        )
    } else {
        references = options.references ? options.references : null
    }

    return await client.mutate({
        mutation: updateKeyMutation,
        variables: {
            id,
            updateId,
            net,
            references,
            publicState,
            publicTags,
            // only private tags can be encrypted
            privateTags:
                privateTags && sharedKey
                    ? await Promise.all(
                          privateTags.map(async (tag: string) => {
                              return await finalizeTag({
                                  key: sharedKey as ArrayBuffer,
                                  data: tag,
                              })
                          })
                      )
                    : privateTags,
            nonce: nonce ? await serializeToBase64(nonce) : undefined,
            key: completedKey ? new Blob([completedKey.data]) : undefined,
            actions: options.actions ? [...options.actions] : undefined,
            contentHash: options.contentHash ? options.contentHash : undefined,
            authorization: [...options.authorization],
        },
    })
}
