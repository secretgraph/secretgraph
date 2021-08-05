import { ApolloClient } from '@apollo/client';
import * as Interfaces from '../interfaces';
import { unserializeToArrayBuffer } from './encryption';
export declare const createClient: (url: string) => ApolloClient<import("@apollo/client").NormalizedCacheObject>;
export declare function createSignatureReferences(content: Parameters<typeof unserializeToArrayBuffer>[0], privkeys: (Interfaces.KeyInput | Interfaces.CryptoHashPair | PromiseLike<Interfaces.KeyInput | Interfaces.CryptoHashPair>)[], hashalgo: string): Promise<Interfaces.ReferenceInterface[]>;
export declare function encryptSharedKey(sharedkey: ArrayBuffer, pubkeys: (Interfaces.KeyInput | Interfaces.CryptoHashPair | PromiseLike<Interfaces.KeyInput | Interfaces.CryptoHashPair>)[], hashalgo?: string): [Promise<Interfaces.ReferenceInterface[]>, Promise<string[]>];
export declare function extractPubKeysCluster(props: {
    readonly node: any;
    readonly authorization: string[];
    readonly params: any;
    old?: {
        [hash: string]: Promise<CryptoKey>;
    };
    readonly onlyPubkeys?: boolean;
}): {
    [hash: string]: Promise<CryptoKey>;
};
export declare function extractPubKeysReferences(props: {
    readonly node: any;
    readonly authorization: string[];
    readonly params: any;
    old?: {
        [hash: string]: Promise<CryptoKey>;
    };
    readonly onlyPubkeys?: boolean;
}): {
    [hash: string]: Promise<CryptoKey>;
};
