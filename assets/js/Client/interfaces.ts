

export interface ConfigCluster {
  hashes: string[]
}

export interface Config {
  certificates: { [hash: string]: string };
  tokens: { [hash: string]: string };
  clusters: { [url: string]: { [flexid: string]: ConfigCluster } };
  baseUrl: string;
}
