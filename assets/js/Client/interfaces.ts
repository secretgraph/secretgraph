
// import { ApolloClient } from "@apollo/client";

export type NonKeyInput = string | File | ArrayBuffer;
export type RawInput = NonKeyInput | CryptoKey;
export type KeyInput = RawInput | CryptoKeyPair;

export interface KeyOutInterface {
  data: ArrayBuffer
}

export interface CryptoRSAInInterface {
  readonly data: RawInput | PromiseLike<RawInput>
  readonly key: KeyInput | PromiseLike<KeyInput>
  readonly hashAlgorithm?: string | PromiseLike<string>
}

export interface CryptoRSAOutInterface extends KeyOutInterface {
  data: ArrayBuffer
  key: CryptoKey
  hashAlgorithm: string
  nonce?: ArrayBuffer
}

export interface CryptoGCMInInterface {
  readonly data: RawInput | PromiseLike<RawInput>
  readonly key: KeyInput | PromiseLike<KeyInput>
  readonly nonce?: string | File | ArrayBuffer | PromiseLike<string | File | ArrayBuffer>
}

export interface CryptoGCMOutInterface extends KeyOutInterface {
  key: CryptoKey
  nonce: ArrayBuffer
}

export interface PWInterface {
  readonly pw: NonKeyInput | PromiseLike<NonKeyInput>
  readonly salt: NonKeyInput | PromiseLike<NonKeyInput>
  readonly iterations: number | string | PromiseLike<number | string>
  readonly hashAlgorithm?: string | PromiseLike<string>
}


export interface ActionInterface {
  start?: string
  stop?: string
  value: string
  key: string
}

export interface ReferenceInterface {
  target: string;
  group: string;
  extra: string;
}

export interface ConfigContentInterface {
  hashes: { [hash: string]: string[] };
}

export interface ConfigClusterInterface {
  hashes: { [hash: string]: string[] };
}


export interface ConfigInterface {
  certificates: { [hash: string]: string };
  tokens: { [hash: string]: string };
  hosts: { [url: string]: {
    hashAlgorithms: string[],
    clusters: { [flexid: string]: ConfigClusterInterface }
    contents: { [flexid: string]: ConfigContentInterface }
  }};
  baseUrl: string;
  configHashes: string[];
  configCluster: string;
}


export interface SecretgraphEventInterface {
  pingCreate?: boolean
}


export interface SnackMessageInterface {
  severity: string,
  message: string
}

export interface MainContextInterface {
  action: string;
  title: null | string;
  state: string;
  item: null | string;
  // activeUrl can be changed without changing active element, so cache it here
  url: null | string;
  type: null | string;
  shareUrl: null | string;
}

export interface SearchContextInterface {
  cluster: null | string;
  include: string[];
  exclude: string[];
  // environment: Environment | null;
}

export interface AuthInfoInterface {
  keys: string[];
  hashes: string[];
}

export interface ElementEntryInterface {
  label: string;
  ignore?: boolean;
  component: React.LazyExoticComponent<any>;
}
