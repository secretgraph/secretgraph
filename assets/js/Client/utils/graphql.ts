// TODO: remove when type description becomes better
declare module 'extract-files' {
  var extractFiles: any
}

import { Environment, FetchFunction, Network, RecordSource, Store, fetchQuery, commitMutation } from "relay-runtime";
import { extractFiles } from 'extract-files';
import { createClusterMutation } from "../queries/cluster";
import { createContentMutation } from "../queries/content";
import { serverConfigQuery } from "../queries/server";
import { ConfigInterface, ReferenceInterface, ActionInterface } from "../interfaces";
import { b64toarr, sortedHash } from "./misc";
import { PBKDF2PW, arrtogcmkey, arrtorsaoepkey } from "./encryption";
import { checkConfig } from "./config";
import { mapHashNames } from "../constants"


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
    const resultPromise = response.json();
    if (!response.ok){
      return Promise.reject(await resultPromise)
    }
    return await resultPromise;
  }
  return new Environment({
    network: Network.create(executeRequest),
    store: new Store(new RecordSource()),
  });
}


export function createContentAuth(
  config: ConfigInterface, clusters: string[], action: string="view", url?: string, keysink?: any
){
  const authkeys: string[] = [];
  const privkeys: PromiseLike<any>[] = [];
  let usedUrl: string;
  if(url){
    usedUrl=url;
  } else {
    usedUrl=config.baseUrl;
  }
  const checkActions =  (el: string) => [action, "manage"].includes(el);
  for(let clusterid of clusters){
    const c = config.clusters[usedUrl] ? config.clusters[usedUrl][clusterid] : undefined;
    if (c?.hashes){
      for(let hash in c.hashes) {
        if(keysink && hash in config.certificates){
          privkeys.push(arrtorsaoepkey(b64toarr(config.certificates[hash])).then(keysink));
        } else if (c.hashes[hash].findIndex(checkActions) !== -1 && hash in config.tokens){
          authkeys.push(`${clusterid}:${config.tokens[hash]}`);
        }/** else if (!c.hashes[hash] && hash in config.tokens){
          authkeys.push(`${hash}:${config.tokens[hash]}`);
        } */
      }
    }
  }
  return [authkeys, Promise.allSettled(privkeys)]
}

export function hashContent(content: ArrayBuffer, privkeys: CryptoKey[], hashalgo: string, hashes?: string[]) : Promise<ReferenceInterface[]> {
  const references: PromiseLike<ReferenceInterface>[] = [];
  for(let counter=0; counter<privkeys.length;counter++){
    const privkey = privkeys[counter];
    let hash = hashes ? Promise.resolve(hashes[counter]): crypto.subtle.exportKey(
      "jwk",
      privkey
    ).then(
      (data) => {
        // remove private data from JWK
        delete data.d;
        delete data.dp;
        delete data.dq;
        delete data.q;
        delete data.qi;
        data.key_ops = ["wrapKey"];
        return crypto.subtle.importKey("jwk", data, { name: "RSA-OAEP",
          hash: hashalgo }, true, ["wrapKey"]);
        }
    ).then(
      (pubkey) => crypto.subtle.exportKey(
        "spki" as const,
        pubkey
      )
    ).then(
      (exported) => crypto.subtle.digest(
        hashalgo, exported
      ).then(
        (hashed) => btoa(String.fromCharCode(... new Uint8Array(hashed)))
      )
    );
    references.push(
      Promise.all([
        hash,
        crypto.subtle.sign(
          {
            name: "RSA-PSS",
            saltLength: 32,
          },
          privkey,
          content
        )
      ]).then((arr) : ReferenceInterface => {
        return {
          "target": arr[0],
          "group": "key",
          "extra": btoa(String.fromCharCode(... new Uint8Array(arr[1])))
        }
      })
    )
  }

  return Promise.all(references);
}


export function encryptSharedKey(sharedkey: Uint8Array, pubkeys: CryptoKey[], hashalgo?: string, hashes?: string[]) : [Promise<ReferenceInterface[]>, Promise<string[]>] {
  const references: PromiseLike<ReferenceInterface>[] = [];
  const info: PromiseLike<string>[] = [];
  for(let counter=0; counter<pubkeys.length;counter++){
    const pubkey = pubkeys[counter];
    let hash = hashes ? Promise.resolve(hashes[counter]): crypto.subtle.exportKey(
      "spki" as const,
      pubkey
    ).then(
      (exported) => crypto.subtle.digest(
        hashalgo as string, exported
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
  privkeys: CryptoKey[] = [],
  info: string[]=[],
  contentHash: string | null = null,
  references: ReferenceInterface[]=[],
  actions: ActionInterface[]=[],
  hashalgo?: string,
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
    )
  );

  const actionkeys = createContentAuth(
    config, [cluster], "manage", usedUrl
  )[0] as string[]

  const halgo = mapHashNames[hashalgo ? hashalgo : (await fetchQuery(
    env, serverConfigQuery, {}
  ) as any).secretgraphConfig.hashAlgorithms[0]];

  const [referencesPromise, infoPromise ] = encryptSharedKey(key, pubkeys, halgo);
  const referencesPromise2 = encryptedContentPromise.then(
    (data) => hashContent(data, privkeys, halgo)
  );

  return await new Promise(async (resolve, reject) => {
    const newInfo: string[] = await infoPromise;
    const newReferences: ReferenceInterface[] = await referencesPromise;
    commitMutation(
      env, {
        mutation: createContentMutation,
        variables: {
          cluster: cluster,
          references: newReferences.concat(await referencesPromise2, references),
          info: newInfo.concat(info),
          nonce: nonceb64,
          value: await encryptedContentPromise.then((enc) => new File([enc], "value")),
          actions: actions,
          contentHash: contentHash,
          authorization: actionkeys
        },
        onError: (error: any) => {
          reject(error);
        },
        onCompleted: (result: any, errors: any) => {
          if(errors){
            reject(errors);
          }
          resolve(result);
        }
      }
    );
  });
}

export function createCluster(
  env: Environment,
  actions: ActionInterface[],
  publicKey: CryptoKey,
  privateKey?: CryptoKey,
  privateKeyKey?: Uint8Array,
  publicInfo?: string,
  authorization?: string[]
){
  let nonceb64 : null | string = null;

  let privateKeyPromise: Promise<null | File>;
  if(privateKey && privateKeyKey){
    const nonce = crypto.getRandomValues(new Uint8Array(13));
    nonceb64 = btoa(String.fromCharCode(... nonce));
    privateKeyPromise = Promise.all([
      arrtogcmkey(privateKeyKey),
      crypto.subtle.exportKey(
        "pkcs8" as const,
        privateKey
      )
    ]).then((arr) => crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce
      },
      arr[0],
      arr[1]
    ).then((obj) => new File([obj], "privateKey")));
  } else {
    privateKeyPromise = Promise.resolve(null);
  }
  const exportPublicKeyPromise = crypto.subtle.exportKey(
    "spki" as const,
    publicKey
  ).then((obj) => new File([obj], "publicKey"));

  return new Promise(async (resolve, reject) => {
    commitMutation(
      env, {
        mutation: createClusterMutation,
        variables: {
          publicInfo: publicInfo,
          publicKey: await exportPublicKeyPromise,
          privateKey: await privateKeyPromise,
          nonce: nonceb64,
          actions: actions,
          authorization: authorization
        },
        onCompleted: (result: any, errors: any) => {
          if(errors) {
            return Promise.reject(errors);
          }
          resolve(result)
        },
        onError: (error: any) => {
          reject(error);
        }
      }
    );
  });
}

export async function initializeCluster(env: Environment, config: ConfigInterface, key: string, iterations: number) {
  const nonce = crypto.getRandomValues(new Uint8Array(13));
  const warpedkeyPromise = PBKDF2PW(key, nonce, iterations);
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      //modulusLength: 8192,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-512"
    },
    true,
    ["wrapKey", "sign", "encrypt"]
  ) as CryptoKeyPair;
  const digestCertificatePromise = crypto.subtle.exportKey(
    "spki" as const,
    publicKey
  ).then((keydata) => crypto.subtle.digest(
    config.hashAlgorithm,
    keydata
  ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data)))));

  const warpedKey = await warpedkeyPromise;

  const digestActionKeyPromise = crypto.subtle.digest(
    config.hashAlgorithm,
    warpedKey
  ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data))));
  const warpedkeyb64 = btoa(String.fromCharCode(...warpedKey));

  return await createCluster(
    env,
    [
      { value: '{"action": "manage"}', key: warpedkeyb64 }
    ],
    publicKey,
    privateKey,
    warpedKey
  ).then(async (result: any) => {
    const clusterResult = result.updateOrCreateCluster;
    const [digestActionKey, digestCertificate] = await Promise.all([digestActionKeyPromise, digestCertificatePromise]);
    config.configCluster = clusterResult.cluster["id"];
    config.configHashes = [digestActionKey, digestCertificate];
    config["clusters"][config["baseUrl"]] = {};
    config["clusters"][config["baseUrl"]][clusterResult.cluster["id"]] = {
      hashes: {}
    }
    config["clusters"][config["baseUrl"]][clusterResult.cluster["id"]].hashes[
      digestActionKey
    ] = ["manage", "create", "update"];
    config["clusters"][config["baseUrl"]][clusterResult.cluster["id"]].hashes[
      digestCertificate
    ] = [];
    config["certificates"][
      digestCertificate
    ] = await crypto.subtle.exportKey(
      "pkcs8" as const,
      privateKey
    ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data))));
    config["tokens"][digestActionKey] = warpedkeyb64;
    if (!checkConfig(config)){
      console.error("invalid config created");
      return;
    }
    const digest = await sortedHash(["type=Config"], config.hashAlgorithm);
    return await createContent(
      env,
      config,
      clusterResult.cluster["id"],
      new File([JSON.stringify(config)], "value"),
      [publicKey],
      [privateKey],
      ["type=Config", "state=internal"],
      digest,
      undefined,
      [],
      config.hashAlgorithm
    ).then(() => {
      return [config, clusterResult.cluster.id as string];
    })
  })
}
