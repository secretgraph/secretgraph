
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { createUploadLink } from 'apollo-upload-client';
import { ConfigInterface, ReferenceInterface} from "../interfaces";
import { rsaKeyTransform, serializeToBase64, unserializeToArrayBuffer, encryptRSAOEAP } from "./encryption";
import { mapHashNames } from "../constants";


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
          privkeys.push(keysink(config.certificates[hash]));
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
  const references: Promise<ReferenceInterface>[] = [];
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
    let hash = hashes ? hashes[counter]: (transforms["pubkey"] as Promise<CryptoKey>).then(
      async (pubkey) => {
        const exported = await crypto.subtle.exportKey(
          "spki" as const,
          pubkey
        );
        return await serializeToBase64(crypto.subtle.digest(
          hashalgo, exported
        ))
      }
    ) as Promise<string>;
    references.push(
      Promise.all([
        hash,
        (transforms["signkey"] as Promise<CryptoKey>).then(
          (signkey) => serializeToBase64(crypto.subtle.sign(
            {
              name: "RSA-PSS",
              saltLength: mapHashNames[hashalgo].length,
            },
            signkey,
            content
          ))
        ) as Promise<string>
      ]).then((arr) : ReferenceInterface => {
        return {
          "target": arr[0],
          "group": "signature",
          "extra": arr[1]
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
    let hash = hashes ? Promise.resolve(hashes[counter]): unserializeToArrayBuffer(
      pubkey
    ).then(
      (exported) => serializeToBase64(crypto.subtle.digest(
        hashalgo as string, exported
      ))
    );
    references.push(
      Promise.all([
        hash,
        encryptRSAOEAP(
          {
            key: pubkey,
            data: sharedkey
          }
        ).then((data) => serializeToBase64(data.data))
      ]).then((arr) : ReferenceInterface => {
        return {
          "target": arr[0],
          "group": "key",
          "extra": arr[1]
        }
      })
    )
    tags.push(hash.then((hashstr:string) : string => `key_hash=${hashstr}`));
  }
  return [Promise.all(references), Promise.all(tags)]
}
