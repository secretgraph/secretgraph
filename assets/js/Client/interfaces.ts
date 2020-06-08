

export interface ConfigClusterInterface {
  hashes: { [hash: string]: string[] }
}


export interface ConfigInterface {
  certificates: { [hash: string]: string };
  tokens: { [hash: string]: string };
  clusters: { [url: string]: { [flexid: string]: ConfigClusterInterface } };
  baseUrl: string;
}


export interface SecretgraphEventInterface {
  created: boolean,
  configUrl?: string
}
