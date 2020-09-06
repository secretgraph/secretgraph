
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
  clusters: { [url: string]: { [flexid: string]: ConfigClusterInterface } };
  // contents: { [url: string]: { [flexid: string]: ConfigContentInterface } };
  baseUrl: string;
  configHashes: string[];
  configCluster: string;
  hashAlgorithm: string;
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
  component: React.LazyExoticComponent<any>;
}
