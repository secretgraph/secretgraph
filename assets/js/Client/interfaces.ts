
import { Environment } from "relay-runtime";

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
  cluster: null | string;
  action: string;
  subaction: string;
  include: string[];
  exclude: string[];
  item: null | string;
  state: string;
  activeUrl: string;
  // environment: Environment | null;
}
