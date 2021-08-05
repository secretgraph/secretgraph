import * as Interfaces from '../interfaces';
import { RequireAttributes, UnpackPromise } from '../typing';
export interface CertificateEntry {
    type: 'certificate';
    newHash: string;
    oldHash: null | string;
    note: string;
    data: string;
}
export interface ActionMapperEntry extends Omit<CertificateEntry, 'type'> {
    type: 'action';
    configActions: Set<string>;
    foundActions: Set<string>;
}
export interface CertificateInputEntry {
    type: 'certificate';
    data: string;
    newHash?: string;
    oldHash?: string;
    note: string;
    update?: boolean;
    delete?: boolean;
    readonly?: boolean;
    locked: true;
}
export interface ActionInputEntry extends Omit<CertificateInputEntry, 'type' | 'locked'> {
    type: 'action';
    start: Date | '';
    stop: Date | '';
    value: {
        [key: string]: any;
    } & {
        action: string;
    };
    locked?: boolean;
}
export declare function generateActionMapper({ nodeData, config, knownHashes: knownHashesIntern, unknownTokens, unknownKeyhashes, hashAlgorithm, }: {
    nodeData?: any;
    config: Interfaces.ConfigInterface;
    knownHashes?: ({
        [hash: string]: string[];
    } | {
        keyHash: string;
        type: string;
    }[])[];
    unknownTokens?: string[];
    unknownKeyhashes?: string[];
    hashAlgorithm: string;
}): Promise<{
    [newHash: string]: ActionMapperEntry | CertificateEntry;
}>;
export declare function transformActions({ actions, hashAlgorithm, mapper: _mapper, }: {
    actions: (ActionInputEntry | CertificateInputEntry)[];
    hashAlgorithm: string;
    mapper?: ReturnType<typeof generateActionMapper> | UnpackPromise<ReturnType<typeof generateActionMapper>>;
}): Promise<{
    configUpdate: RequireAttributes<Interfaces.ConfigInputInterface, "certificates" | "tokens" | "hosts">;
    actions: Interfaces.ActionInterface[];
    hashes: {
        [hash: string]: string[] | null;
    };
}>;
