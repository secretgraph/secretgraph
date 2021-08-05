export declare const utf8encoder: TextEncoder;
export declare const utf8decoder: TextDecoder;
export declare function utf8ToBinary(inp: string): string;
export declare function b64toarr(inp: string): Uint8Array;
export declare function b64toutf8(inp: string): string;
export declare function sortedHash(inp: string[], algo: string): Promise<string>;
export declare function mergeDeleteObjects(oldObj: any, newObj: any, objHandler?: (a: any, b: any) => [any, number]): [any, number];
export declare function deepEqual<T>(a: T, b: T): boolean;
