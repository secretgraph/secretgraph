
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { createUploadLink } from 'apollo-upload-client';
import { ConfigInterface, ReferenceInterface} from "../interfaces";
import { unserializeToCryptoKey, serializeToBase64, unserializeToArrayBuffer, encryptRSAOEAP } from "./encryption";
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
  options: {
    readonly config: ConfigInterface,
    readonly clusters: string[],
    readonly action?: string,
    url?: string,
    keysink?: any
  }
){
  const authkeys: string[] = [];
  const privkeys: PromiseLike<any>[] = [];
  let usedUrl: string;
  if(options.url){
    usedUrl=options.url;
  } else {
    usedUrl=options.config.baseUrl;
  }
  const checkActions =  (el: string) => [options.action ? options.action : "view", "manage"].includes(el);
  for(let clusterid of options.clusters){
    const c = options.config.hosts[usedUrl] ? options.config.hosts[usedUrl].clusters[clusterid] : undefined;
    if (c?.hashes){
      for(let hash in c.hashes) {
        if(options.keysink && hash in options.config.certificates){
          privkeys.push(options.keysink(options.config.certificates[hash]));
        } else if (c.hashes[hash].findIndex(checkActions) !== -1 && hash in options.config.tokens){
          authkeys.push(`${clusterid}:${options.config.tokens[hash]}`);
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
  if(!mapHashNames[hashalgo]){
    throw Error("hashalgorithm not supported: "+hashalgo)
  }
  const hashalgo2 = mapHashNames[hashalgo].name;
  const hashalgo2_len = mapHashNames[hashalgo].length;
  for(let counter=0; counter<privkeys.length;counter++){
    const privkey = privkeys[counter];
    const signKey = unserializeToCryptoKey(privkey, {
      name: "RSA-PSS",
      hash: hashalgo2
    }, "privateKey");
    const hashfn = async () => {
      if (hashes){
        return hashes[counter];
      }
      const exported = await crypto.subtle.exportKey(
        "spki" as const,
        await unserializeToCryptoKey(privkey, {
          name: "RSA-OAEP",
          hash: hashalgo2
        }, "publicKey")
      );
      return await serializeToBase64(crypto.subtle.digest(
        hashalgo2,
        exported
      ))
    }
    references.push(
      Promise.all([
        hashfn(),
        signKey.then(
          (signkey) => serializeToBase64(crypto.subtle.sign(
            {
              name: "RSA-PSS",
              saltLength: hashalgo2_len / 8,
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
            data: sharedkey,
            hashAlgorithm: hashalgo
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
