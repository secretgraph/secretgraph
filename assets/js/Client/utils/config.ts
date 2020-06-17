import { ConfigInterface } from "../interfaces";
import { PBKDF2PW, arrtogcmkey } from "./encryption";
import { b64toarr, utf8encoder } from "./misc";
import { saveAs } from 'file-saver';
import { findConfigQuery } from "../queries/content"
import { fetchQuery, Environment } from "relay-runtime";


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
    !(config.configCluster)
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
    let result = await fetch(obj);
    if (!result.ok){
      return null;
    }
    let parsedResult = await result.json();
    if (pw && parsedResult.data){
      parsedResult = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: parsedResult.nonce
        },
        await PBKDF2PW(pw, parsedResult.nonce, parsedResult.iterations).then((data) => arrtogcmkey(data)),
        b64toarr(parsedResult.data)
      ).then((data) => String.fromCharCode(...new Uint8Array(data)));
    }
    return checkConfig(parsedResult);
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

export function exportConfigAsUrl(env: Environment, config: ConfigInterface, withpw: boolean = true) {
  let action : string | null = null, certhash : string | null = null;
  for(const hash of config.configHashes) {
    if(config.tokens[hash]){
      action = config.tokens[hash];
    } else if (config.certificates[hash]){
      certhash = hash;
    }
  }
  if (!action){
    return;
  }
  console.log(`${config.configCluster}:${action}`)
  return fetchQuery(
    env,
    findConfigQuery,
    {
      cluster: config.configCluster,
      authorization: [`${config.configCluster}:${action}`]
    }
  ).then((data:any) => {
    console.log(data.contents);
    data.contents

  });
}
