
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { relayStylePagination } from "@apollo/client/utilities";
import { createUploadLink } from 'apollo-upload-client';
import { ConfigInterface, ReferenceInterface, CryptoHashPair, KeyInput} from "../interfaces";
import { unserializeToCryptoKey, serializeToBase64, encryptRSAOEAP } from "./encryption";
import { mapHashNames } from "../constants";


export const createClient = (url: string) => {
  return new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: {
        SecretgraphObject: {
          queryType: true,
          fields: {
            // could be dangerous to activate, wait until tests are possible
            //clusters: relayStylePagination(),
            //contents: relayStylePagination()
          },
        },
      },
    }),
    link: createUploadLink({
      uri: url
    }),
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

async function createSignatureReferences_helper(key: KeyInput | CryptoHashPair | PromiseLike<KeyInput | CryptoHashPair>, hashalgo: string, content: ArrayBuffer | PromiseLike<ArrayBuffer>){
  const _x = await key;
  let signkey: KeyInput, hash: string | Promise<string>;
  const hashalgo2 = mapHashNames[hashalgo].operationName;
  const hashalgo2_len = mapHashNames[hashalgo].length;
  if ((_x as any)["hash"]) {
    signkey = (_x as CryptoHashPair).key
    hash = (_x as CryptoHashPair).hash
  } else {
    signkey = (key as KeyInput)
    hash = serializeToBase64(crypto.subtle.digest(
      hashalgo2,
      await crypto.subtle.exportKey(
        "spki" as const,
        await unserializeToCryptoKey(
          (key as KeyInput), {
            name: "RSA-OAEP",
            hash: hashalgo2,
          }, "publicKey"
        )
      )
    ));
  }

  return {
    signature: await serializeToBase64(crypto.subtle.sign(
      {
        name: "RSA-PSS",
        saltLength: hashalgo2_len / 8,
      },
      await unserializeToCryptoKey(
        signkey, {
          name: "RSA-PSS",
          hash: hashalgo2,
        }, "privateKey"
      ),
      await content
    )),
    hash: await hash
  }
}

export function createSignatureReferences(content: ArrayBuffer, privkeys: (KeyInput | CryptoHashPair | PromiseLike<KeyInput | CryptoHashPair>)[], hashalgo: string) : Promise<ReferenceInterface[]> {
  const references: Promise<ReferenceInterface>[] = [];
  if(!mapHashNames[hashalgo]){
    throw Error("hashalgorithm not supported: "+hashalgo)
  }
  for(let counter=0; counter<privkeys.length;counter++){
    references.push(
      createSignatureReferences_helper(
        privkeys[counter], hashalgo, content
      ).then(({signature, hash}) : ReferenceInterface => {
        return {
          "target": hash,
          "group": "signature",
          "extra": signature
        }
      })
    )
  }

  return Promise.all(references);
}

async function encryptSharedKey_helper(key: KeyInput | CryptoHashPair | PromiseLike<KeyInput | CryptoHashPair>, hashalgo: string | undefined, sharedkey: Uint8Array) {
  const _x = await key;
  let pubkey: CryptoKey | Promise<CryptoKey>, hash: string | Promise<string>;
  const hashalgo2 = mapHashNames[""+hashalgo].operationName;
  if ((_x as any)["hash"]) {
    pubkey = (_x as CryptoHashPair).key
    hash = (_x as CryptoHashPair).hash
  } else {
    if(!hashalgo2){
      throw new Error("Invalid hash algorithm/no hash algorithm specified and no CryptoHashPair provided: "+hashalgo2)
    }
    pubkey = unserializeToCryptoKey((key as KeyInput), {
      name: "RSA-OAEP",
      hash: hashalgo2,
    }, "publicKey")
    hash = serializeToBase64(crypto.subtle.digest(
      hashalgo2,
      await crypto.subtle.exportKey(
        "spki" as const,
        await pubkey
      )
    ));
  }
  return {
    encrypted: await encryptRSAOEAP(
      {
        key: pubkey,
        data: sharedkey,
        hashAlgorithm: hashalgo2
      }
    ).then((data) => serializeToBase64(data.data)),
    hash: await hash
  }
}

export function encryptSharedKey(sharedkey: Uint8Array, pubkeys: (KeyInput | CryptoHashPair | PromiseLike<KeyInput | CryptoHashPair>)[], hashalgo?: string) : [Promise<ReferenceInterface[]>, Promise<string[]>] {
  const references: PromiseLike<ReferenceInterface>[] = [];
  const tags: PromiseLike<string>[] = [];
  for(let counter=0; counter<pubkeys.length;counter++){
    const temp = encryptSharedKey_helper(
      pubkeys[counter], hashalgo, sharedkey
    );
    references.push(
      temp.then(({encrypted, hash}) : ReferenceInterface => {
        return {
          "target": hash,
          "group": "key",
          "extra": encrypted
        }
      })
    )
    tags.push(temp.then(({hash}) : string => `key_hash=${hash}`));
  }
  return [Promise.all(references), Promise.all(tags)]
}

// onlyPubkeys skips checks which can fail in case of missing tag inclusion
// this is the case with the findConfigQuery
export function extractPubKeys(props: {
  readonly node: any,
  readonly authorization: string[], 
  readonly params: any,
  old?: {[hash: string]: Promise<CryptoKey>}
  readonly onlyPubkeys?:boolean
}): {[hash: string]: Promise<CryptoKey>}{
  const pubkeys = props.old || {};
  for(const ref of props.node.references.edges){
    const keyNode = ref.target
    if(!props.onlyPubkeys && (!keyNode.tags.includes("type=PublicKey"))){
      continue
    }
    if(!pubkeys[keyNode.contentHash]){
      pubkeys[keyNode.contentHash] = fetch(props.node.link, {
        headers: {
          Authorization: props.authorization.join(","),
        },
      }).then((result) => unserializeToCryptoKey(result.arrayBuffer(), props.params, "publicKey"));
    }
  }
  return pubkeys;
}