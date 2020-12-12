
import { saveAs } from 'file-saver';

import { ConfigInterface, ConfigInputInterface, AuthInfoInterface } from "../interfaces";
import { encryptPreKey, decryptFirstPreKey, decryptAESGCM, decryptRSAOEAP, encryptAESGCM, serializeToBase64 } from "./encryption";
import { b64toarr, utf8encoder, mergeDeleteObjects } from "./misc";
import { findConfigQuery } from "../queries/content";
import { mapHashNames } from "../constants";
import { ApolloClient } from '@apollo/client';


export function cleanConfig(config: ConfigInterface | null | undefined) {
  if(!config){
    return null;
  }
  if (
    !config.baseUrl ||
    !(config.hosts instanceof Object) ||
    !(config.tokens instanceof Object) ||
    !(config.certificates instanceof Object) ||
    !(config.configHashes instanceof Array) ||
    !config.configCluster
  ){
    console.error(config);
    return null;
  }
  for(const _host in config.hosts){
    const host = config.hosts[_host];
    if (!host["clusters"]){
      host["clusters"] = {};
    }
    if (!host["contents"]){
      host["contents"] = {};
    }
  }

  return config;
}

export async function checkConfigObject(client: ApolloClient<any>, config: ConfigInterface){
  let actions : string[] = [], cert : Uint8Array | null = null;
  for(const hash of config.configHashes) {
    if(config.tokens[hash]){
      actions.push(config.tokens[hash]);
    } else if(config.certificates[hash]){
      cert = b64toarr(config.certificates[hash]);
    }
  }
  if (!actions || !cert){
    return false;
  }
  const tokens = actions.map(action => `${config.configCluster}:${action}`);
  const result = await client.query({
    query:  findConfigQuery,
    variables: {
      cluster: config.configCluster,
      authorization: tokens
    }
  });
  if (!result || result.data.contents.edges.length < 1){
    return false;
  }
  if (result.data.contents.edges.length > 1){
    console.error("Too many config objects found", result.data.contents.edges);
    return false;
  }
  return true;
}

export const loadConfigSync = (obj: Storage = window.localStorage): ConfigInterface | null => {
  let result = obj.getItem("secretgraphConfig");
  if (!result) {
    return null;
  }
  return cleanConfig(JSON.parse(result));
}


export const loadConfig = async (obj: string | File | Request | Storage = window.localStorage, pws?: string[]): Promise<ConfigInterface | null> => {
  if ( obj instanceof Storage ) {
    return loadConfigSync(obj);
  } else if ( obj instanceof File ) {
    let parsedResult = JSON.parse(await obj.text());
    if (pws && parsedResult.data){
      const parsedResult2 : ArrayBuffer = await decryptFirstPreKey({
        prekeys: parsedResult.prekeys,
        pws,
        hashAlgorithm: "SHA-512",
        iterations: parsedResult.iterations,
        fn: async (data: [ArrayBuffer, string | null]) => {
          if (data[1]){
            return Promise.reject("not for decryption");
          }
          return (await decryptAESGCM({
            data: parsedResult.data,
            key: data[0],
            nonce: parsedResult.nonce
          })).data;
        }
      }) as any;
      return cleanConfig(JSON.parse(String.fromCharCode(...new Uint8Array(parsedResult2))));
    }
    return cleanConfig(parsedResult);
  } else {
    let request : Request;
    if(obj instanceof Request){
      request = obj;
    } else {
      request = new Request(obj);
    }
    const contentResult = await fetch(request);
    if (!contentResult.ok){
      return null;
    }
    const decrypturl = new URL(request.url);
    const prekeys = decrypturl.searchParams.getAll("prekey");
    decrypturl.searchParams.delete("prekey");
    if (pws){
      decrypturl.searchParams.set("keys", "")
      const decryptResult = await fetch(new Request(
        decrypturl.toString(), {
          headers: request.headers
        }
      ));
      decrypturl.searchParams.delete("keys")
      if (!decryptResult.ok || !contentResult.headers.get("X-NONCE")){
        return null;
      }
      const keyArr = await new Promise<[CryptoKey, Uint8Array, string]>(async (resolve, reject) => {
        const queries=[];
        // support only one page
        const page = await decryptResult.json();
        for(const k of page.keys){
          if (!k.link){
            continue;
          }
          decrypturl.pathname = k.link;
          queries.push(fetch(new Request(
            decrypturl.toString(), {
              headers: request.headers
            }
          )).then(async (response) => {
            if (!response.ok || !response.headers.get("X-NONCE") || !response.headers.get("X-ITERATIONS")){
              return;
            }
            const nonce = b64toarr(response.headers.get("X-NONCE") as string);
            const respdata = await response.arrayBuffer();
            for(const iterations of (response.headers.get("X-ITERATIONS") as string).split(",")){
              try {
                return await decryptFirstPreKey({
                  prekeys,
                  pws,
                  hashAlgorithm: "SHA-512",
                  iterations,
                  fn: async (data: [ArrayBuffer, string | null]) => {
                    if (data[1]){
                      return Promise.reject("not for decryption");
                    }
                    return await decryptAESGCM({
                      key: data[0],
                      nonce: nonce,
                      data: respdata
                    }).then(
                      (data) => resolve([data.key, nonce, k.extra])
                    );
                  }
                });
              } finally {}
            }
          }));
        }
        await Promise.allSettled(queries);
        reject();
      });
      const sharedKey = await decryptAESGCM({
        key: keyArr[0],
        nonce: keyArr[1],
        data: keyArr[2]

      });
      const config = await decryptAESGCM({
          key: sharedKey.data,
          nonce: b64toarr(contentResult.headers.get("X-NONCE") as string),
          data: contentResult.arrayBuffer()

        }).then((data) => cleanConfig(JSON.parse(String.fromCharCode(...new Uint8Array(data.data))))
      )
      return cleanConfig(config);
    } else if(prekeys) {
      throw("requires pw but not specified");
    }
    try {
      return cleanConfig(await contentResult.json());
    } catch(e) {
      console.warn(e);
      return null;
    }

  }
}

export function saveConfig(config: ConfigInterface | string, storage: Storage = window.localStorage) {
  if( typeof(config) !== "string" ) {
    config = JSON.stringify(config);
  }
  storage.setItem("secretgraphConfig", config);
}

export async function exportConfig(config: ConfigInterface | string, pws?: string[] | string, iterations?: number, name?: string) {
  let newConfig: any;
  if( pws && typeof(pws) === "string" ) {
    pws = [pws];
  }
  if( typeof(config) !== "string" ) {
    config = JSON.stringify(config);
  }
  if (pws && iterations){
    const mainkey = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptAESGCM({
      key: mainkey,
      data: utf8encoder.encode(config)
    })
    const prekeys = [];
    for(const pw of pws){
      prekeys.push(
        encryptPreKey({
          prekey: mainkey, pw, hashAlgorithm: "SHA-512", iterations
        })
      );
    }
    newConfig = JSON.stringify({
      data: await serializeToBase64(encrypted.data),
      iterations: iterations,
      nonce: await serializeToBase64(encrypted.nonce),
      prekeys: await Promise.all(prekeys)
    });
  } else {
    newConfig = config;
  }
  if (!name){
    return newConfig;
  }
  saveAs(
    new File(
      [newConfig],
      name,
      {type: "text/plain;charset=utf-8"}
    )
  );
}

export async function exportConfigAsUrl(client: ApolloClient<any>, config: ConfigInterface, pw?: string) {
  let actions : string[] = [], cert : Uint8Array | null = null;
  for(const hash of config.configHashes) {
    if(config.tokens[hash]){
      actions.push(config.tokens[hash]);
    } else if(config.certificates[hash]){
      cert = b64toarr(config.certificates[hash]);
    }
  }
  if (!actions){
    return;
  }
  const tokens = actions.map(action => `${config.configCluster}:${action}`);
  const obj = await client.query({
    query:  findConfigQuery,
    variables: {
      cluster: config.configCluster,
      authorization: tokens
    }
  });
  let certhashes: string[] = [];
  if (!cert){
    return Promise.reject("no cert found");
  }
  certhashes = await Promise.all(obj.data.secretgraph.config.hashAlgorithms.map(
    (hash: string) => crypto.subtle.digest(mapHashNames[hash].operationName, cert as Uint8Array).then(
      (data) => btoa(String.fromCharCode(... new Uint8Array(data)))
    )
  ));
  const searchcerthashes = new Set(actions.map(hash => `key_hash=${hash}`));
  for(const node of obj.data.contents.edges){
    if(!node.node.tags.includes("type=Config")){
      continue;
    }
    for(const keyrefnode of node.node.references.edges){
      const keyref = keyrefnode.node;
      if(keyref.target.tags.findIndex((val: any) => searchcerthashes.has(val)) == -1){
        continue;
      }
      const privkeyrefnode = keyref.target.references.find((node: any) => node.node.target.tags);
      if(!privkeyrefnode){
        continue;
      }
      const privkeykey = privkeyrefnode.node.target.tags.find((tag: string) => tag.startsWith("key=")).split("=", 2)[1];
      const url = new URL(config.baseUrl);
      const sharedKeyPrivateKeyRes = await decryptRSAOEAP({
        key: cert,
        data: privkeykey
      })
      if (pw) {
        const sharedKeyConfigRes =  decryptRSAOEAP({
          key: sharedKeyPrivateKeyRes.key,
          data:keyref.extra
        })
        const prekey = await encryptPreKey({
          prekey: sharedKeyPrivateKeyRes.data,
          pw,
          hashAlgorithm: "SHA-512",
          iterations: obj.data.secretgraph.config.PBKDF2Iterations
        });
        const prekey2 = await encryptPreKey({
          prekey: (await sharedKeyConfigRes).data,
          pw,
          hashAlgorithm: "SHA-512",
          iterations: obj.data.secretgraph.config.PBKDF2Iterations
        });
        return `${url.origin}${node.node.link}?decrypt&token=${tokens.join("token=")}&prekey=${certhashes[0]}:${prekey}&prekey=shared:${prekey2}`
      } else {
        return `${url.origin}${node.node.link}?decrypt&token=${tokens.join("token=")}&token=${certhashes[0]}:${btoa(String.fromCharCode(... new Uint8Array(sharedKeyPrivateKeyRes.data)))}`
      }
    }
  }
  throw Error("no config content found")
}


export function extractAuthInfo({config, url, require=["view", "update", "manage"], ...props}: {
  config: ConfigInterface, url: string,
  clusters?: string[],
  require?: string[]
}) : AuthInfoInterface {
  const keys = [];
  const hashes = [];
  const clusters = config.hosts[(new URL(url, window.location.href)).href].clusters;
  for (const id in clusters) {
    if (props.clusters && !props.clusters.includes(id)){
      continue;
    }
    const clusterconf = clusters[id];
    for (const hash in clusterconf.hashes){
      const actions = clusterconf.hashes[hash];
      if (config.tokens[hash] && require.some((val) => actions.includes(val))){
        hashes.push(hash);
        keys.push(`${id}:${config.tokens[hash]}`);
      }
    }
  }
  return {hashes, keys};
}


export function findCertCandidatesForRefs(config: ConfigInterface, nodeData: any) : [Uint8Array, Uint8Array][] {
  const found: [Uint8Array, Uint8Array][] = [];
  if (nodeData.tags.includes("type=PrivateKey")){
    const hashes = [];
    for(const tag of nodeData.tags){
      if (tag.startsWith("key_hash=")){
        const cleanhash = tag.split("=", 2)[1];
        if(cleanhash && config.certificates[cleanhash]){
          hashes.push(b64toarr(cleanhash))
        }
      }
    }
    for(const tag of nodeData.tags){
      if (tag.startsWith("key=")){
        for(const hash of hashes){
          found.push([
            hash,
            b64toarr(tag.split("=", 2)[1])
          ]);
        }
      }
    }
  }
  for(const refnode of nodeData.references.edges){
    for(const dirtyhash of refnode.target.tags){
      const cleanhash = dirtyhash.split("=", 2)[1];
      if(cleanhash && config.certificates[cleanhash]){
        found.push([
          b64toarr(config.certificates[cleanhash]),
          b64toarr(refnode.extra)
        ]);
      }
    }
  }
  return found;
}


export function updateConfigReducer(state: ConfigInterface | null, update: ConfigInputInterface | null) : (ConfigInterface | null){
  if (update === null){
    return null;
  }
  const newState : ConfigInterface = Object.create(state || {})
  if(update.certificates){
    newState.certificates = mergeDeleteObjects(newState.certificates, update.certificates)
  }
  if(update.tokens){
    newState.tokens = mergeDeleteObjects(newState.tokens, update.tokens)
  }
  if(update.baseUrl){
    newState.baseUrl = update.baseUrl
  }
  if(update.configHashes){
    newState.configHashes = update.configHashes
  }
  if(update.configCluster){
    newState.configCluster = update.configCluster
  }
  if (update.hosts) {
    newState.hosts = mergeDeleteObjects(
      newState.hosts, update.hosts, (oldval: any, newval: any) => {
        const newState = Object.create(oldval || {})
        if(newval.hashAlgorithms){
          newState.hashAlgorithms = newval.hashAlgorithms
        }
        if(newval.clusters){
          newState.clusters = mergeDeleteObjects(newState.clusters, newval.clusters)
        }
        if(newval.contents){
          newState.contents = mergeDeleteObjects(newState.contents, newval.contents)
        }
        return newState;
      }
    )
  }
  return newState
}


export async function updateConfigReducerSync(state: ConfigInterface | null, update: ConfigInputInterface | null, client: ApolloClient<any>) : Promise<ConfigInterface | null>{
  if (update === null){
    return null;
  }
  let ret
  ret = updateConfigReducer(state, update) 
  return ret
}