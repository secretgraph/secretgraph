
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { createUploadLink } from 'apollo-upload-client';
import { createClusterMutation } from "../queries/cluster";
import { createContentMutation, contentQuery } from "../queries/content";
import { serverConfigQuery } from "../queries/server";
import { ConfigInterface, ReferenceInterface, ActionInterface, AuthInfoInterface } from "../interfaces";
import { b64toarr } from "./misc";
import { arrToGCMKey, arrToRSAOEPkey, rsaKeyTransform } from "./encryption";


export const createClient = (url: string) => {
  const link: any = createUploadLink({
    uri: url
  });
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: link,
    name: 'secretgraph',
    version: '0.1',
    queryDeduplication: false,
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-and-network',
      },
    },
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
    const c = config.hosts[usedUrl] ? config.hosts[usedUrl].clusters[clusterid] : undefined;
    if (c?.hashes){
      for(let hash in c.hashes) {
        if(keysink && hash in config.certificates){
          privkeys.push(arrToRSAOEPkey(b64toarr(config.certificates[hash])).then(keysink));
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
    let transforms;
    if (!privkey.extractable && (!hashes || !privkey.usages.includes("sign"))){
      throw Error("missing key usages")
    }
    if(!privkey.usages.includes("sign")) {
      transforms = rsaKeyTransform(privkey, hashalgo, {signkey: true, pubkey: !(hashes)});
    } else  {
      transforms = rsaKeyTransform(privkey, hashalgo, {signkey: false, pubkey: !(hashes)});
      transforms["signkey"] = Promise.resolve(privkey);
    }
    let hash = hashes ? Promise.resolve(hashes[counter]): (transforms["pubkey"] as PromiseLike<CryptoKey>).then(
      async (pubkey) => {
        const exported = await crypto.subtle.exportKey(
          "spki" as const,
          pubkey
        );
        return await crypto.subtle.digest(
          hashalgo, exported
        ).then(
          (hashed) => btoa(String.fromCharCode(... new Uint8Array(hashed)))
        )
      }
    ) as PromiseLike<string>;
    references.push(
      Promise.all([
        hash,
        (transforms["signkey"] as PromiseLike<CryptoKey>).then(
          (signkey) => crypto.subtle.sign(
            {
              name: "RSA-PSS",
              saltLength: 32,
            },
            signkey,
            content
          )
        ) as PromiseLike<ArrayBufferLike>
      ]).then((arr) : ReferenceInterface => {
        return {
          "target": arr[0],
          "group": "signature",
          "extra": btoa(String.fromCharCode(... new Uint8Array(arr[1])))
        }
      })
    )
  }

  return Promise.all(references);
}


export function encryptSharedKey(sharedkey: Uint8Array, pubkeys: CryptoKey[], hashalgo?: string, hashes?: string[]) : [Promise<ReferenceInterface[]>, Promise<string[]>] {
  const references: PromiseLike<ReferenceInterface>[] = [];
  const tags: PromiseLike<string>[] = [];
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
    tags.push(hash.then((hashstr:string) : string => `key_hash=${hashstr}`));
  }
  return [Promise.all(references), Promise.all(tags)]
}
