import { ConfigInterface } from "../interfaces"
import { saveAs } from 'file-saver';


export function loadConfigSync(obj: Storage = window.localStorage): ConfigInterface | null {
  let result = obj.getItem("secretgraphConfig");
  if (!result) {
    return null;
  }
  return JSON.parse(result);
}

export async function loadConfig(obj: string | File | Request | Storage = window.localStorage): Promise<ConfigInterface | null> {
  if ( obj instanceof Storage ) {
    return loadConfigSync(obj);
  } else if ( obj instanceof File ) {
    let result = await obj.text();
    return JSON.parse(result);
  } else {
    let result = await fetch(obj);
    if (!result.ok){
      return null;
    }
    return await result.json();
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
