export declare const protectedActions: Set<string>;
export declare const contentStates: Map<string, {
    label: any;
}>;
export declare const mapHashNames: {
    [algo: string]: {
        readonly operationName: string;
        readonly length: number;
        readonly serializedName: string;
    };
};
export declare const mapEncryptionAlgorithms: {
    readonly [algo: string]: {
        readonly usages: KeyUsage[];
    };
};
