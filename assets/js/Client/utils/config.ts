
import { saveAs } from 'file-saver';
import { fetchQuery, Environment, RecordSource } from "relay-runtime";

import { ConfigInterface } from "../interfaces";
import { PBKDF2PW, arrtogcmkey, arrtorsaoepkey } from "./encryption";
import { b64toarr, utf8encoder } from "./misc";
import { findConfigQuery } from "../queries/content";
import { mapHashNames } from "../constants";
import { ListItemText } from '@material-ui/core';

export function checkConfig(config: ConfigInterface | null | undefined) {
  if(!config){
    return null;
  }
  if (
    !config.baseUrl ||
    !(config.clusters instanceof Object) ||
    !(config.tokens instanceof Object) ||
    !(config.certificates instanceof Object) ||
    !(config.configHashes instanceof Array) ||
    !config.configCluster ||
    !config.hashAlgorithm
  ){
    return null;
  }

  return config;
}


export const loadConfigSync = (obj: Storage = window.localStorage): ConfigInterface | null => {
  let result = obj.getItem("secretgraphConfig");
  if (!result) {
    return null;
  }
  return checkConfig(JSON.parse(result));
}


export const loadConfig = async (obj: string | File | Request | Storage = window.localStorage, pw?: string): Promise<ConfigInterface | null> => {
  if ( obj instanceof Storage ) {
    return loadConfigSync(obj);
  } else if ( obj instanceof File ) {
    let parsedResult = JSON.parse(await obj.text());
    if (pw && parsedResult.data){
      const nonce = b64toarr(parsedResult.nonce);
      const gcmkey = await PBKDF2PW(pw, nonce, parsedResult.iterations).then((data) => arrtogcmkey(data));
      parsedResult = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonce
        },
        gcmkey,
        b64toarr(parsedResult.data)
      ).then((data) => JSON.parse(String.fromCharCode(...new Uint8Array(data))));
    }
    return checkConfig(parsedResult);
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
    if (pw){
      const decrypturl = new URL(request.url);
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
      const config = await new Promise<[CryptoKey, Uint8Array, string]>(async (resolve, reject) => {
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
            const data = await response.arrayBuffer();
            for(const iterations of (response.headers.get("X-ITERATIONS") as string).split(",")){
              const gcmkey = await PBKDF2PW(pw, nonce, parseInt(iterations)).then((data) => arrtogcmkey(data));
              try {
                return await crypto.subtle.decrypt(
                  {
                    name: "AES-GCM",
                    iv: nonce
                  },
                  gcmkey,
                  data
                ).then(arrtorsaoepkey).then(
                  (key) => resolve([key, nonce, k.extra])
                )
              } finally {}
            }
          }));
        }
        Promise.allSettled(queries).then(() => reject());
      }).then(
        arr => crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: arr[1]
          },
          arr[0],
          b64toarr(arr[2])
        ).then(arrtogcmkey)
      ).then(
        async (key) => crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: b64toarr(contentResult.headers.get("X-NONCE") as string)
          },
          key,
          await contentResult.arrayBuffer()
        ).then((data) => JSON.parse(String.fromCharCode(...new Uint8Array(data))))
      )
      return checkConfig(config);
    }
    try {
      return checkConfig(await contentResult.json());
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

export async function exportConfig(config: ConfigInterface | string, pw?: string, iterations?: number, name?: string) {
  let newConfig: any;
  if( typeof(config) !== "string" ) {
    config = JSON.stringify(config);
  }
  if (pw && iterations){
    const nonce = crypto.getRandomValues(new Uint8Array(13));
    newConfig = JSON.stringify({
      data: await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce
        },
        await PBKDF2PW(pw, nonce, iterations).then((data) => arrtogcmkey(data)),
        utf8encoder.encode(config)
      ).then((data) => btoa(String.fromCharCode(...new Uint8Array(data)))),
      iterations: iterations,
      nonce: btoa(String.fromCharCode(... nonce))
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

export function exportConfigAsUrl(env: Environment, config: ConfigInterface, pwtoken?: ArrayBufferLike) {
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
  return fetchQuery(
    env,
    findConfigQuery,
    {
      cluster: config.configCluster,
      authorization: tokens
    }
  ).then(async (data:any) => {
    let certhashes: string[] = [];
    if (pwtoken) {
      const ncert = cert;
      if (!ncert){
        return Promise.reject("no cert found")
      }
      certhashes = await Promise.all(data.secretgraphConfig.hashAlgorithms.map(
        (hash: string) => crypto.subtle.digest(mapHashNames[hash], ncert).then(
          (data) => btoa(String.fromCharCode(... new Uint8Array(data)))
        )
      ));
    }
    for(const node of data.contents.edges){
      if("type=Config" in node.node.info){
        if (pwtoken) {
          return `${data.secretgraphConfig.baseUrl}contents/${node.node.id}/?token=${tokens.join("token=")}&token=${certhashes[0]}:${btoa(String.fromCharCode(... new Uint8Array(pwtoken)))}`
        } else {
          return `${data.secretgraphConfig.baseUrl}${node.node.link}/?token=${tokens.join("token=")}`;
        }
      }
    }
    throw Error("Invalid response")
  });
}
