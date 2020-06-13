// TODO: remove when type description becomes better
declare module 'extract-files' {
  var extractFiles: any
}

import { Environment, FetchFunction, Network, RecordSource, Store, fetchQuery, commitMutation } from "relay-runtime";
import { extractFiles } from 'extract-files';
import { createClusterMutation } from "../queries/cluster";
import { createContentMutation } from "../queries/content";
import { ConfigInterface, ReferenceInterface, ActionInterface } from "../interfaces";
import { b64toarr, utf8ToBinary } from "./misc";
import { PBKDF2PW, arrtogcmkey, arrtorsaoepkey } from "./encryption";


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


export function createContentAuth(
  config: ConfigInterface, clusters: string[], action: string="view", url?: string, keyuser?: any
){
  const authkeys: string[] = [];
  const privkeys: PromiseLike<any>[] = [];
  let usedUrl: string;
  if(url){
    usedUrl=url;
  } else {
    usedUrl=config.baseUrl;
  }
  const checkActions =  (el: string) => el in [action, "manage"];
  for(const clusterid in clusters){
    const c = config.clusters[usedUrl] ? config.clusters[usedUrl][clusterid] : undefined;
    if (c?.hashes){
      for(const hash in c.hashes) {
        if(keyuser && hash in config.certificates){
          privkeys.push(arrtorsaoepkey(b64toarr(config.certificates[hash])).then(keyuser));
        } else if (c.hashes[hash].some(checkActions) && hash in config.tokens){
          authkeys.push(`${clusterid}:${config.tokens[hash]}`);
        }/** else if (!c.hashes[hash] && hash in config.tokens){
          authkeys.push(`${hash}:${config.tokens[hash]}`);
        } */
      }
    }
  }
  return [authkeys, Promise.allSettled(privkeys)]
}


export function encryptSharedKey(sharedkey: Uint8Array, pubkeys: CryptoKey[], hashes?: string[]) : [Promise<ReferenceInterface[]>, Promise<string[]>] {
  const references: PromiseLike<ReferenceInterface>[] = [];
  const info: PromiseLike<string>[] = [];
  for(let counter=0; counter<pubkeys.length;counter++){
    const pubkey = pubkeys[counter];
    let hash = hashes ? Promise.resolve(hashes[counter]): crypto.subtle.exportKey(
      "spki" as const,
      pubkey
    ).then(
      (exported) => crypto.subtle.digest(
        "SHA-512", exported
      ).then(
        (hashed) => btoa(String.fromCharCode(... new Uint8Array(hashed)))
      )
    );
    references.push(
      Promise.all([
        hash,
        crypto.subtle.encrypt(
          {
            name: "RSA-OAEP",
          },
          pubkey,
          sharedkey
        )
      ]).then((arr) : ReferenceInterface => {
        return {
          "target": arr[0],
          "group": "key",
          "extra": btoa(String.fromCharCode(... new Uint8Array(arr[1])))
        }
      })
    )
    info.push(hash.then((hashstr:string) : string => `key_hash=${hashstr}`));
  }
  return [Promise.all(references), Promise.all(info)]
}


export async function createContent(
  env: Environment,
  config: ConfigInterface,
  cluster: string,
  value: File | Blob,
  pubkeys: CryptoKey[],
  info: string[]=[],
  contentHash: string | null = null,
  actions: ActionInterface[]=[],
  references: ReferenceInterface[]=[],
  url?: string
) {
  const nonce = crypto.getRandomValues(new Uint8Array(13));
  const nonceb64 = btoa(String.fromCharCode(... nonce));
  const key = crypto.getRandomValues(new Uint8Array(32));
  let usedUrl: string;
  if(url){
    usedUrl=url;
  } else {
    usedUrl=config.baseUrl;
  }

  const encryptedContentPromise = Promise.all([
    arrtogcmkey(key), value.arrayBuffer()
  ]).then(
    (arr) => crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce
      },
      arr[0],
      arr[1]
    ).then((enc) => new File([enc], "value"))
  );

  const actionkeys = createContentAuth(
    config, [cluster], "manage", usedUrl
  )[0] as string[]
  const [referencesPromise, infoPromise ] = encryptSharedKey(key, pubkeys);

  return await new Promise(async (resolve, reject) => {
    const newInfo: string[] = await infoPromise;
    const newReferences: ReferenceInterface[] = await referencesPromise;
    commitMutation(
      env, {
        mutation: createContentMutation,
        variables: {
          "cluster": cluster,
          "references": newReferences.concat(references),
          "info": newInfo.concat(info),
          "nonce": nonceb64,
          "value": await encryptedContentPromise,
          "actions": actions,
          "contentHash": contentHash,
          "headers": {
            "Authorization": actionkeys.join()
          }
        },
        onError: (error: any) => {
          reject(error);
        },
        onCompleted: (result: any) => resolve(result)
      }
    );
  });
}

export async function initializeCluster(env: Environment, config: ConfigInterface, key: string, iterations: number) {
  const nonce = crypto.getRandomValues(new Uint8Array(13));
  const nonceb64 = btoa(String.fromCharCode(... nonce));
  const warpedkeyPromise = PBKDF2PW(key, nonce, iterations);
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

  const exportPrivateKeyPromise = crypto.subtle.exportKey(
    "pkcs8" as const,
    privateKey
  )
  const exportPublicKeyPromise = crypto.subtle.exportKey(
    "spki" as const,
    publicKey
  ).then((obj) => new File([obj], "publicKey"));
  const encryptedPrivateKeyPromise = Promise.all([
    warpedkeyPromise.then(arrtogcmkey), exportPrivateKeyPromise
  ]).then((arr) => crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce
    },
    arr[0],
    arr[1]
  ).then((obj) => new File([obj], "privateKey")));

  const [PrivateKey, PublicKey, warpedkeyb64] = await Promise.all([
    encryptedPrivateKeyPromise,
    exportPublicKeyPromise,
    warpedkeyPromise.then((data) => btoa(String.fromCharCode(...data)))
  ]);

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
      ] = ["manage", "create", "update"];
      config["clusters"][config["baseUrl"]][cluster.cluster["id"]].hashes[
        cluster.publicKeyHash
      ] = [];
      config["certificates"][cluster.publicKeyHash] = cluster.privateKey;
      config["tokens"][digest] = cluster.actionKey;
      return await createContent(
        env,
        config,
        cluster.cluster["id"],
        new File([JSON.stringify(config)], "value"),
        [publicKey],
        ["type=Config", "state=internal"]
      ).then( () => resolve([
            config, cluster.cluster.id as string
          ])
      );
    }
    commitMutation(
      env, {
        mutation: createClusterMutation,
        variables: {
          key: key,
          actionKey: warpedkeyb64,
          publicKey: PublicKey,
          privateKey: PrivateKey,
          nonce: nonceb64
        },
        onCompleted: createInit,
        onError: (error: any) => {
          reject(error);
        }
      }
    );
  });
}
