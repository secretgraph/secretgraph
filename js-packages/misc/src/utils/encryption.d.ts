import * as Interfaces from '../interfaces';
export declare function findWorkingHashAlgorithms(hashAlgorithms: string[]): string[];
export declare function hashObject(obj: Parameters<typeof unserializeToArrayBuffer>[0], hashAlgorithm: string): Promise<string>;
export declare function toPBKDF2key(inp: Interfaces.RawInput | PromiseLike<Interfaces.RawInput>): Promise<CryptoKey>;
export declare function toPublicKey(inp: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>, params: any): Promise<CryptoKey>;
export declare function unserializeToArrayBuffer(inp: Interfaces.RawInput | Interfaces.KeyOutInterface | PromiseLike<Interfaces.RawInput | Interfaces.KeyOutInterface>): Promise<ArrayBuffer>;
export declare function serializeToBase64(inp: Interfaces.RawInput | Interfaces.KeyOutInterface | PromiseLike<Interfaces.RawInput | Interfaces.KeyOutInterface>): Promise<string>;
export declare function unserializeToCryptoKey(inp: Interfaces.KeyInput | PromiseLike<Interfaces.KeyInput>, params: any, type?: 'privateKey' | 'publicKey', failInsteadConvert?: boolean): Promise<CryptoKey>;
export declare function encryptRSAOEAP(options: Interfaces.CryptoRSAInInterface | Promise<Interfaces.CryptoRSAInInterface>): Promise<Interfaces.CryptoRSAOutInterface>;
export declare function decryptRSAOEAP(options: Interfaces.CryptoRSAInInterface | Promise<Interfaces.CryptoRSAInInterface>): Promise<Interfaces.CryptoRSAOutInterface>;
export declare function encryptAESGCM(options: Interfaces.CryptoGCMInInterface | Promise<Interfaces.CryptoGCMInInterface>): Promise<Interfaces.CryptoGCMOutInterface>;
export declare function decryptAESGCM(options: Interfaces.CryptoGCMInInterface | Promise<Interfaces.CryptoGCMInInterface>): Promise<Interfaces.CryptoGCMOutInterface>;
export declare function derivePW(options: Interfaces.PWInterface | PromiseLike<Interfaces.PWInterface>): Promise<{
    data: ArrayBuffer;
    key: CryptoKey;
}>;
export declare function encryptTag(options: Interfaces.CryptoGCMInInterface & {
    readonly tag?: string | PromiseLike<string>;
    readonly encrypt?: Set<string>;
}): Promise<string>;
export declare function decryptTagRaw(options: Interfaces.CryptoGCMInInterface): Promise<Interfaces.CryptoGCMOutInterface>;
export declare function decryptTag(options: Omit<Interfaces.CryptoGCMInInterface, 'data'> & {
    readonly data: string | PromiseLike<string>;
}): Promise<{
    tag: string;
    key: CryptoKey;
    nonce: ArrayBuffer;
    data: ArrayBuffer;
}>;
export declare function extractUnencryptedTags(options: {
    readonly tags: PromiseLike<Iterable<string | PromiseLike<string>>> | Iterable<string | PromiseLike<string>>;
}): Promise<{
    [tag: string]: string[];
}>;
export declare function extractTags(options: Omit<Interfaces.CryptoGCMInInterface, 'data'> & {
    readonly tags: PromiseLike<Iterable<string | PromiseLike<string>>> | Iterable<string | PromiseLike<string>>;
    readonly decrypt: Set<string>;
}): Promise<{
    [tag: string]: string[];
}>;
export declare function encryptPreKey({ prekey, pw, hashAlgorithm, iterations, }: {
    prekey: ArrayBuffer;
    pw: Interfaces.NonKeyInput;
    hashAlgorithm: string;
    iterations: number;
}): Promise<string>;
export declare function decryptPreKeys(options: {
    prekeys: ArrayBuffer[] | string[];
    pws: Interfaces.NonKeyInput[];
    hashAlgorithm: string;
    iterations: number | string;
}): Promise<[ArrayBuffer, string | null][]>;
export declare function decryptFirstPreKey(options: {
    prekeys: ArrayBuffer[] | string[];
    pws: Interfaces.NonKeyInput[];
    hashAlgorithm: string;
    iterations: number | string;
    fn?: any;
}): Promise<(string | ArrayBuffer | null)[]>;
