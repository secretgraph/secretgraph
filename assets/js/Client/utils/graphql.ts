// TODO: remove when type description becomes better
declare module 'extract-files' {
  var extractFiles: any
}

import { Environment, FetchFunction, Network, RecordSource, Store, fetchQuery, commitMutation } from "relay-runtime";
import { extractFiles } from 'extract-files';
import { createClusterMutation } from "../queries/cluster";
import { createContentMutation } from "../queries/content";
import { ConfigInterface } from "../interfaces";

export const createEnvironment = (url: string) => {
  const executeRequest: FetchFunction = async function(operation, variables) {
    const headers: object = variables["headers"];
    delete variables["headers"];
    const { clone, files } = extractFiles(variables, "variables");
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
        ...headers
      },
      body: formData,
    });
    return response.json();
  }
  return new Environment({
    network: Network.create(executeRequest),
    store: new Store(new RecordSource()),
  });
}

export function initializeCluster(env: Environment, config: ConfigInterface, key?: string | null) {
  return new Promise((resolve, reject) => {
    const createInit = async (result: any, errors: any) => {
      if(errors) {
        reject(errors);
      }
      const cluster = result.updateOrCreateCluster;
      const digest: string = btoa(String.fromCharCode(... new Uint8Array(
        await crypto.subtle.digest(
          "SHA-512",
          Uint8Array.from(atob(cluster.actionKey), c => c.charCodeAt(0))
        )
      )));
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

      commitMutation(
        env, {
          mutation: createContentMutation,
          variables: {
            "cluster": cluster.cluster.id,
            "info": ["type=Config", "state=internal"],
            "value": new File([JSON.stringify(config)], "value"),
            "headers": {
              "Authorization": `${cluster.cluster.id}:${cluster.actionKey}`
            }
          },
          onError: (error: any) => {
            reject(error);
          },
          onCompleted: () => resolve([
            config, cluster.cluster.id as string
          ])
        }
      );
    }
    commitMutation(
      env, {
        mutation: createClusterMutation,
        variables: { "key": key },
        onCompleted: createInit,
        onError: (error: any) => {
          reject(error);
        }
      }
    );
  });
}
