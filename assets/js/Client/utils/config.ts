import { ConfigInterface } from "../interfaces";
import { PBKDF2PW, arrtogcmkey } from "./encryption";
import { b64toarr } from "./misc";
import { saveAs } from 'file-saver';


export function checkConfig(config: ConfigInterface | null | undefined) {
  if(!config){
    return null;
  }
  if (!config.baseUrl || !(config.clusters instanceof Object) || !(config.tokens instanceof Object) || !(config.certificates instanceof Object)){
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
    let result = JSON.parse(await obj.text());
    if (pw && parsedResult.data){
      result = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: result.nonce
        },
        await PBKDF2PW(pw, result.nonce, result.iterations).then((data) => arrtogcmkey(data)),
        b64toarr(result.data)
      ).then((data) => String.fromCharCode(...new Uint8Array(data)));
    }
    return checkConfig(result);
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

export function exportConfig(config: ConfigInterface | string, name: string = "secretgraph_settings.json") {
  if( typeof(config) !== "string" ) {
    config = JSON.stringify(config);
  }
  saveAs(
    new File(
      [config],
      name,
      {type: "text/plain;charset=utf-8"}
    )
  );
}
