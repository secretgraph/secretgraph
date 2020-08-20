import { createClusterMutation } from "../queries/cluster";
import { createContentMutation } from "../queries/content";
import { serverConfigQuery } from "../queries/server";
import { ConfigInterface, ReferenceInterface, ActionInterface } from "../interfaces";
import { b64toarr, sortedHash, utf8encoder } from "./misc";
import { arrtogcmkey, arrtorsaoepkey, rsakeytransform } from "./encryption";
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { createUploadLink } from 'apollo-upload-client';
import { checkConfig } from "./config";
import { mapHashNames } from "../constants"


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
    let transforms;
    if (!privkey.extractable && (!hashes || !privkey.usages.includes("sign"))){
      throw Error("missing key usages")
    }
    if(!privkey.usages.includes("sign")) {
      transforms = rsakeytransform(privkey, hashalgo, {signkey: true, pubkey: !(hashes)});
    } else  {
      transforms = rsakeytransform(privkey, hashalgo, {signkey: false, pubkey: !(hashes)});
      transforms["signkey"] = Promise.resolve(privkey);
    }
    let hash = hashes ? Promise.resolve(hashes[counter]): (transforms["pubkey"] as PromiseLike<CryptoKey>).then(
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
        (transforms["signkey"] as PromiseLike<CryptoKey>).then(
          signkey => crypto.subtle.sign(
          {
            name: "RSA-PSS",
            saltLength: 32,
          },
          signkey,
          content
        )
      )
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


export async function createContent(
  client: ApolloClient<any>,
  config: ConfigInterface,
  options: {
    cluster: string,
    value: File | Blob,
    pubkeys: CryptoKey[],
    privkeys?: CryptoKey[],
    tags: string[],
    contentHash?: string | null,
    references?: ReferenceInterface[] | null,
    actions?: ActionInterface[],
    hashAlgorithm?: string,
    url?: string
  }
) {
  const nonce = crypto.getRandomValues(new Uint8Array(13));
  const nonceb64 = btoa(String.fromCharCode(... nonce));
  const key = crypto.getRandomValues(new Uint8Array(32));
  let url: string;
  if(options.url){
    url=options.url;
  } else {
    url=config.baseUrl;
  }

  const encryptedContentPromise = Promise.all([
    arrtogcmkey(key), options.value.arrayBuffer()
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
    config, [options.cluster], "manage", url
  )[0] as string[]

  const halgo = mapHashNames[options.hashAlgorithm ? options.hashAlgorithm : (await client.query(
    {query: serverConfigQuery}
  ) as any).data.secretgraphConfig.hashAlgorithms[0]];

  const [referencesPromise, tagsPromise ] = encryptSharedKey(key, options.pubkeys, halgo);
  const referencesPromise2 = encryptedContentPromise.then(
    (data) => hashContent(data, options.privkeys ? options.privkeys : [], halgo)
  );
  const newTags: string[] = await tagsPromise;
  const newReferences: ReferenceInterface[] = await referencesPromise;
  return await client.mutate({
    mutation: createContentMutation,
    variables: {
      cluster: options.cluster,
      references: newReferences.concat(await referencesPromise2, options.references ? options.references : []),
      tags: newTags.concat(options.tags),
      nonce: nonceb64,
      value: await encryptedContentPromise.then((enc) => new File([enc], "value")),
      actions: options.actions,
      contentHash: options.contentHash ? options.contentHash : null,
      authorization: actionkeys
    }
  });
}

export async function createCluster(
  client: ApolloClient<any>,
  actions: ActionInterface[],
  publicInfo: string,
  publicKey: CryptoKey,
  privateKey?: CryptoKey,
  privateKeyKey?: Uint8Array,
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
  return await client.mutate({
    mutation: createClusterMutation,
    variables: {
      publicInfo: new File([utf8encoder.encode(publicInfo)], "publicInfo"),
      publicKey: await exportPublicKeyPromise,
      privateKey: await privateKeyPromise,
      privateTags: ["state=internal"],
      nonce: nonceb64,
      actions: actions,
      authorization: authorization
    }
  });
}

export async function initializeCluster(
  client: ApolloClient<any>, config: ConfigInterface
) {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      //modulusLength: 8192,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-512"
    },
    true,
    ["wrapKey", "encrypt", "decrypt"]
  ) as CryptoKeyPair;
  const digestCertificatePromise = crypto.subtle.exportKey(
    "spki" as const,
    publicKey
  ).then((keydata) => crypto.subtle.digest(
    config.hashAlgorithm,
    keydata
  ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data)))));
  const digestActionKeyPromise = crypto.subtle.digest(
    config.hashAlgorithm,
    crypto.getRandomValues(new Uint8Array(32))
  ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data))));
  const keyb64 = btoa(String.fromCharCode(...key));

  return await createCluster(
    client,
    [
      { value: '{"action": "manage"}', key: keyb64 }
    ],
    "",
    publicKey,
    privateKey,
    key
  ).then(async (result: any) => {
    const clusterResult = result.data.updateOrCreateCluster;
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
    config["tokens"][digestActionKey] = keyb64;
    if (!checkConfig(config)){
      console.error("invalid config created");
      return;
    }
    const digest = await sortedHash(["type=Config"], config.hashAlgorithm);
    return await createContent(
      client,
      config,
      {
        cluster: clusterResult.cluster["id"],
        value: new File([JSON.stringify(config)], "value"),
        pubkeys: [publicKey],
        privkeys: [privateKey],
        tags: ["type=Config", "state=internal"],
        contentHash: digest,
        hashAlgorithm: config.hashAlgorithm
      }
    ).then(() => {
      return [config, clusterResult.cluster.id as string];
    })
  })
}
