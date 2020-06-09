// TODO: remove when type description becomes better
declare module 'extract-files' {
  var extractFiles: any
}

import { Environment, Network, RecordSource, Store, fetchQuery } from "relay-runtime";
import { extractFiles } from 'extract-files';
import { createClusterMutation } from "../queries/cluster";
import { createContentMutation } from "../queries/content";
import { ConfigInterface } from "../interfaces";

export const createEnvironment = (url: string) => {
  async function fetchQuery(operation: any, variables: any) {
    const headers: object = variables["headers"];
    delete variables["headers"];
    const { clone, files } = extractFiles(variables);
    const formData  = new FormData();
    formData.append(
      "operations",
      JSON.stringify({
        query: operation.text,
        variables: clone,
      })
    )
    const map: { [counter: string]: string[] } = {};
    let i = 0;
    files.forEach((paths: string[], file: File) => {
      map[i.toString()] = paths;
      formData.append(i.toString(), file);
      i++;
    });
    formData.append('map', JSON.stringify(map));

    const response = await fetch(url as string, {
      method: "POST",
      mode: "cors",
      credentials: 'include',
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: formData,
    });
    return response.json();
  }
  return new Environment({
    network: Network.create(fetchQuery),
    store: new Store(new RecordSource()),
  });
}

export async function initializeCluster(env: Environment, config: ConfigInterface, key?: string | null) {
  const cluster: any = await fetchQuery(
    env, createClusterMutation, { "key": key }
  );
  const digest: string = String.fromCharCode(... new Uint8Array((await crypto.subtle.digest("sha512", cluster.actionKey))));
  config["clusters"][config["baseUrl"]] = {};
  config["clusters"][config["baseUrl"]][cluster.cluster["id"]] = {
    hashes: {}
  }
  config["clusters"][config["baseUrl"]][cluster.cluster["id"]].hashes[
    digest
  ] = ["manage"];
  config["clusters"][config["baseUrl"]][cluster.cluster["id"]].hashes[
    cluster.publicKeyHash
  ] = [];
  config["certificates"][cluster.publicKeyHash] = cluster.privateKey;
  config["tokens"][digest] = cluster.actionKey;

  const content = await fetchQuery(
    env, createContentMutation, {
      "key": cluster.privateKey,
      "cluster": cluster.cluster.id,
      "value": new File([JSON.stringify(config)], "value"),
      "info": ["config", "state=internal"],
      "headers": {
        "Authorization": `${cluster.cluster.id}:${cluster.actionKey}`
      }
    }
  );

  return {
    config,
    clusterId: cluster.cluster.id
  }
}
