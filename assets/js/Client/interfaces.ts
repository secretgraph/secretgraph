
// import { ApolloClient } from "@apollo/client";

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

export interface ConfigClusterInterface {
  hashes: { [hash: string]: string[] };
}

export interface ConfigContentInterface {
  hashes: { [hash: string]: string[] };
}


export interface ConfigInterface {
  certificates: { [hash: string]: string };
  tokens: { [hash: string]: string };
  hosts: { [url: string]: {
    hashAlgorithms: string[],
    clusters: { [flexid: string]: ConfigClusterInterface }
    // contensts: { [flexid: string]: ConfigContentInterface }
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
