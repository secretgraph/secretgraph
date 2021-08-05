import { ApolloClient, FetchResult } from '@apollo/client';
import * as Interfaces from '../interfaces';
import { createSignatureReferences, encryptSharedKey } from './graphql';
export declare function deleteNodes({ ids, client, authorization, }: {
    ids: string[];
    client: ApolloClient<any>;
    authorization: string[];
}): Promise<FetchResult<any, Record<string, any>, Record<string, any>>>;
export declare function resetDeletionNodes({ ids, client, authorization, }: {
    ids: string[];
    client: ApolloClient<any>;
    authorization: string[];
}): Promise<FetchResult<any, Record<string, any>, Record<string, any>>>;
export declare function createContent({ client, cluster, tags: tagsIntern, value, ...options }: {
    client: ApolloClient<any>;
    config: Interfaces.ConfigInterface;
    cluster: string;
    value: Interfaces.CryptoGCMInInterface['data'];
    pubkeys: Parameters<typeof encryptSharedKey>[1];
    privkeys?: Parameters<typeof createSignatureReferences>[1];
    tags: Iterable<string | PromiseLike<string>>;
    contentHash?: string | null;
    references?: Iterable<Interfaces.ReferenceInterface> | null;
    actions?: Iterable<Interfaces.ActionInterface>;
    hashAlgorithm: string;
    authorization: Iterable<string>;
    encryptTags?: Iterable<string>;
}): Promise<FetchResult<any>>;
export declare function createKeys({ client, cluster, privateKey, pubkeys, ...options }: {
    client: ApolloClient<any>;
    config: Interfaces.ConfigInterface;
    cluster: string;
    privateKey?: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>;
    publicKey: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>;
    pubkeys?: Parameters<typeof encryptSharedKey>[1];
    privkeys?: Parameters<typeof createSignatureReferences>[1];
    privateTags?: Iterable<string | PromiseLike<string>>;
    publicTags?: Iterable<string | PromiseLike<string>>;
    contentHash?: string | null;
    privateActions?: Iterable<Interfaces.ActionInterface>;
    publicActions?: Iterable<Interfaces.ActionInterface>;
    hashAlgorithm: string;
    authorization: Iterable<string>;
}): Promise<FetchResult<any>>;
export declare function updateContent({ id, updateId, client, ...options }: {
    id: string;
    updateId: string;
    client: ApolloClient<any>;
    config: Interfaces.ConfigInterface;
    cluster?: string;
    value?: Interfaces.CryptoGCMInInterface['data'];
    pubkeys: Parameters<typeof encryptSharedKey>[1];
    privkeys?: Parameters<typeof createSignatureReferences>[1];
    tags?: Iterable<string | PromiseLike<string>>;
    contentHash?: string | null;
    references?: Iterable<Interfaces.ReferenceInterface> | null;
    actions?: Iterable<Interfaces.ActionInterface>;
    hashAlgorithm?: string;
    authorization: Iterable<string>;
    encryptTags?: Iterable<string>;
    oldKey?: Interfaces.RawInput;
}): Promise<FetchResult<any>>;
export declare function updateKey({ id, updateId, client, ...options }: {
    id: string;
    updateId: string;
    client: ApolloClient<any>;
    config: Interfaces.ConfigInterface;
    cluster?: string;
    key?: CryptoKey | PromiseLike<CryptoKey>;
    pubkeys?: Parameters<typeof encryptSharedKey>[1];
    privkeys?: Parameters<typeof createSignatureReferences>[1];
    tags?: Iterable<string | PromiseLike<string>>;
    contentHash?: string | null;
    references?: Iterable<Interfaces.ReferenceInterface> | null;
    actions?: Iterable<Interfaces.ActionInterface>;
    hashAlgorithm?: string;
    authorization: Iterable<string>;
    encryptTags?: Iterable<string>;
    oldKey?: Interfaces.RawInput;
}): Promise<FetchResult<any>>;
export declare function createCluster(options: {
    client: ApolloClient<any>;
    actions: Iterable<Interfaces.ActionInterface>;
    hashAlgorithm: string;
    description: string;
    publicKey: CryptoKey;
    privateKey?: CryptoKey;
    privateKeyKey?: Uint8Array;
    authorization?: string[];
}): Promise<FetchResult<any>>;
export declare function updateCluster(options: {
    id: string;
    client: ApolloClient<any>;
    updateId: string;
    actions?: Interfaces.ActionInterface[];
    description?: string;
    authorization: string[];
}): Promise<FetchResult<any>>;
export declare function initializeCluster(client: ApolloClient<any>, config: Interfaces.ConfigInterface, hashAlgorithm: string): Promise<{
    config: Interfaces.ConfigInterface;
    cluster: any;
    content: any;
}>;
interface decryptContentObjectInterface extends Omit<Interfaces.CryptoGCMOutInterface, 'nonce' | 'key'> {
    tags: {
        [tag: string]: string[];
    };
    updateId: string;
    nodeData: any;
}
export declare function decryptContentObject({ config: _config, nodeData, blobOrTokens, baseUrl, decrypt, }: {
    config: Interfaces.ConfigInterface | PromiseLike<Interfaces.ConfigInterface>;
    nodeData: any | PromiseLike<any>;
    blobOrTokens: Blob | string | string[] | PromiseLike<Blob | string | string[]>;
    baseUrl?: string;
    decrypt?: Set<string>;
}): Promise<decryptContentObjectInterface | null>;
export declare function updateConfigRemoteReducer(state: Interfaces.ConfigInterface | null, { update, authInfo, client, }: {
    update: Interfaces.ConfigInputInterface | null;
    client: ApolloClient<any>;
    authInfo?: Interfaces.AuthInfoInterface;
}): Promise<Interfaces.ConfigInterface | null>;
export {};
