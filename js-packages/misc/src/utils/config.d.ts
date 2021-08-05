import { ApolloClient } from '@apollo/client';
import * as Interfaces from '../interfaces';
export declare function cleanConfig(config: Interfaces.ConfigInterface | null | undefined): Interfaces.ConfigInterface | null;
export declare function checkConfigObject(client: ApolloClient<any>, config: Interfaces.ConfigInterface): Promise<boolean>;
export declare const loadConfigSync: (obj?: Storage) => Interfaces.ConfigInterface | null;
export declare const loadConfig: (obj?: string | File | Request | Storage, pws?: string[] | undefined) => Promise<Interfaces.ConfigInterface | null>;
export declare function saveConfig(config: Interfaces.ConfigInterface | string, storage?: Storage): void;
export declare function exportConfig(config: Interfaces.ConfigInterface | string, pws?: string[] | string, iterations?: number, name?: string): Promise<any>;
export declare function exportConfigAsUrl({ client, config, pw, iterations, }: {
    client: ApolloClient<any>;
    config: Interfaces.ConfigInterface;
    iterations: number;
    pw?: string;
}): Promise<string>;
export declare function extractAuthInfo({ config, url, require, ...props }: {
    readonly config: Interfaces.ConfigInterface;
    readonly url: string;
    readonly clusters?: Set<string>;
    readonly content?: string;
    readonly require?: Set<string>;
}): Interfaces.AuthInfoInterface;
export declare function extractPrivKeys({ config, url, ...props }: {
    readonly config: Interfaces.ConfigInterface;
    readonly url: string;
    readonly clusters?: Set<string>;
    readonly hashAlgorithm: string;
    old?: {
        [hash: string]: Promise<CryptoKey>;
    };
}): {
    [hash: string]: Promise<CryptoKey>;
};
export declare function findCertCandidatesForRefs(config: Interfaces.ConfigInterface, nodeData: any): {
    hash: string;
    hashAlgorithm?: string | undefined;
    sharedKey: Uint8Array;
}[];
export declare function updateConfig(old: Interfaces.ConfigInterface | null, update: Interfaces.ConfigInputInterface): [Interfaces.ConfigInterface, number];
export declare function updateConfigReducer(state: Interfaces.ConfigInterface | null, inp: {
    update: Interfaces.ConfigInputInterface | null;
    replace?: boolean;
}): Interfaces.ConfigInterface;
export declare function updateConfigReducer(state: Interfaces.ConfigInterface | null, inp: {
    update: Interfaces.ConfigInputInterface | null;
    replace?: boolean;
}): Interfaces.ConfigInterface | null;
/**
export async function updateHash(config: ConfigInterface, old?: string) {
  const newHash = config.hosts[config.baseUrl].hashAlgorithms[0]
  if(old == newHash){
    return config
  }
  const updateMap = new Map<string, string>();
  const ret =  {
    ...config,
    certificates: Object.fromEntries(await Promise.all(Object.entries(config.certificates).map(async([hash, val]) =>{
      let newHash = updateMap.get(hash);
      if (!updateMap.has(hash)){
        updateMap.set(hash, await serializeToBase64(unserializeToArrayBuffer(val).then((buf) => crypto.subtle.digest(
          mapHashNames[""+newHash].operationName, buf
        ))))
      }
      return [
        updateMap.get(hash),
        val
      ]
    }))),
    tokens: Object.fromEntries(await Promise.all(Object.entries(config.tokens).map(async([hash, val]) =>{
      let newHash = updateMap.get(hash);
      if (!updateMap.has(hash)){
        updateMap.set(hash, await serializeToBase64(unserializeToArrayBuffer(val).then((buf) => crypto.subtle.digest(
          mapHashNames[""+newHash].operationName, buf
        ))))
      }
      return [
        updateMap.get(hash),
        val
      ]
    })))
  }
  return ret
} */
