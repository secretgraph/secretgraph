// TODO: remove when type description becomes better
declare module 'extract-files' {
  var extractFiles: any
}

import { Environment, FetchFunction, Network, RecordSource, Store, fetchQuery, commitMutation } from "relay-runtime";
import { extractFiles } from 'extract-files';
import { createClusterMutation } from "../queries/cluster";
import { createContentMutation } from "../queries/content";
import { ConfigInterface } from "../interfaces";
import { b64toarr, utf8ToBinary } from "./misc";
import { PBKDF2PW, arrtogcmkey } from "./encryption";


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

export async function initializeCluster(env: Environment, config: ConfigInterface, key: string, iterations: number) {
  const nonce = crypto.getRandomValues(new Uint8Array(13));
  const nonceb64 = btoa(String.fromCharCode(... nonce));
  const warpedkey = await PBKDF2PW(key, nonce, iterations);
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 8192,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-512"
    },
    true,
    ["wrapKey", "wrapKey", "encrypt"]
  ) as CryptoKeyPair;
  const encryptedPrivateKey = crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce
    },
    await arrtogcmkey(warpedkey),
    privateKey.to
  );

  /**crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    ciphertext
  );
}*/
  return await new Promise((resolve, reject) => {
    const createInit = async (result: any, errors: any) => {
      if(errors) {
        reject(errors);
      }
      const cluster = result.updateOrCreateCluster;
      const digest: string = btoa(String.fromCharCode(... new Uint8Array(
        await crypto.subtle.digest(
          "SHA-512",
          b64toarr(cluster.actionKey)
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
            "cluster": cluster.cluster["id"],
            "info": ["type=Config", "state=internal"],
            "value": new File([JSON.stringify(config)], "value"),
            "headers": {
              "Authorization": `${cluster.cluster["id"]}:${cluster.actionKey}`
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
        variables: {
          key: key,
          actionKey: ,
          publicKey: ,
          privateKey: ,
          nonce:
        },
        onCompleted: createInit,
        onError: (error: any) => {
          reject(error);
        }
      }
    );
  });
}
