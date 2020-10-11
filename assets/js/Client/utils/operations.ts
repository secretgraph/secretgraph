import { createClusterMutation } from "../queries/cluster";
import { createContentMutation, contentQuery } from "../queries/content";
import { serverConfigQuery } from "../queries/server";
import { ConfigInterface, ReferenceInterface, ActionInterface, AuthInfoInterface } from "../interfaces";
import { b64toarr, sortedHash, utf8encoder } from "./misc";
import { decryptRSAOEAP, encryptRSAOEAP, decryptAESGCM, encryptAESGCM, serializeToBase64, unserializeToArrayBuffer} from "./encryption";
import { ApolloClient } from '@apollo/client';
import { checkConfig, extractAuthInfo, findCertCandidatesForRefs } from "./config";
import { createContentAuth, encryptSharedKey, hashContent } from "./graphql";
import { mapHashNames } from "../constants"


export async function createContent(
    options: {
      client: ApolloClient<any>,
      config: ConfigInterface,
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
    const key = crypto.getRandomValues(new Uint8Array(32));
    let url: string;
    if(options.url){
      url=options.url;
    } else {
      url=options.config.baseUrl;
    }

    const encryptedContentPromise = encryptAESGCM({
      key, nonce, data: options.value.arrayBuffer()
    })
    const actionkeys = createContentAuth({
      config: options.config,
      clusters: [options.cluster],
      action: "manage",
      url
    })[0] as string[]

    const halgo = mapHashNames[options.hashAlgorithm ? options.hashAlgorithm : (await options.client.query(
      {query: serverConfigQuery}
    ) as any).data.secretgraphConfig.hashAlgorithms[0]].name;

    const [referencesPromise, tagsPromise ] = encryptSharedKey(key, options.pubkeys, halgo);
    const referencesPromise2 = encryptedContentPromise.then(
      (data) => hashContent(data.data, options.privkeys ? options.privkeys : [], halgo)
    );
    const newTags: string[] = await tagsPromise;
    const newReferences: ReferenceInterface[] = await referencesPromise;
    return await options.client.mutate({
      mutation: createContentMutation,
      variables: {
        cluster: options.cluster,
        references: newReferences.concat(await referencesPromise2, options.references ? options.references : []),
        tags: newTags.concat(options.tags),
        nonce: await serializeToBase64(nonce),
        value: await encryptedContentPromise.then((data) => new File([data.data], "value")),
        actions: options.actions,
        contentHash: options.contentHash ? options.contentHash : null,
        authorization: actionkeys
      }
    });
  }

export async function createCluster(
  options: {
    client: ApolloClient<any>,
    actions: ActionInterface[],
    hashAlgorithm: string,
    publicInfo: string,
    publicKey: CryptoKey,
    privateKey?: CryptoKey,
    privateKeyKey?: Uint8Array,
    authorization?: string[]
  }
){
  let nonce : null | Uint8Array = null;

  let privateKeyPromise: Promise<null | File>;
  const publicKeyPromise = unserializeToArrayBuffer(
    options.publicKey
  ).then((obj) => new File([obj], "publicKey"));
  const privateTags = ["state=internal"];
  if(options.privateKey && options.privateKeyKey){
    nonce = crypto.getRandomValues(new Uint8Array(13));
    privateKeyPromise = encryptAESGCM({
      key: options.privateKeyKey,
      data: options.privateKey
    }).then((obj) => new File([obj.data], "privateKey"));
    privateTags.push(await serializeToBase64(encryptRSAOEAP({
      key: options.privateKey,
      data: options.privateKeyKey,
      hashAlgorithm: options.hashAlgorithm
    })).then((obj) => `key=${obj}`));
  } else {
    privateKeyPromise = Promise.resolve(null);
  }
  return await options.client.mutate({
    mutation: createClusterMutation,
    variables: {
      publicInfo: new File([utf8encoder.encode(options.publicInfo)], "publicInfo"),
      publicKey: await publicKeyPromise,
      privateKey: await privateKeyPromise,
      privateTags: privateTags,
      nonce: nonce ? await serializeToBase64(nonce) : null,
      actions: options.actions,
      authorization: options.authorization
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
      hash: config.hosts[config.baseUrl].hashAlgorithms[0]
    },
    true,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  ) as CryptoKeyPair;
  const digestCertificatePromise = crypto.subtle.exportKey(
    "spki" as const,
    publicKey
  ).then((keydata) => crypto.subtle.digest(
    config.hosts[config.baseUrl].hashAlgorithms[0],
    keydata
  ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data)))));
  const digestActionKeyPromise = crypto.subtle.digest(
    config.hosts[config.baseUrl].hashAlgorithms[0],
    crypto.getRandomValues(new Uint8Array(32))
  ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data))));
  const keyb64 = btoa(String.fromCharCode(...key));

  const clusterResponse = await createCluster({
    client,
    actions: [
      { value: '{"action": "manage"}', key: keyb64 }
    ],
    publicInfo: "",
    hashAlgorithm: config.hosts[config.baseUrl].hashAlgorithms[0],
    publicKey,
    privateKey,
    privateKeyKey: key
  });
  const clusterResult = clusterResponse.data.updateOrCreateCluster;
  const [digestActionKey, digestCertificate] = await Promise.all([digestActionKeyPromise, digestCertificatePromise]);
  config.configCluster = clusterResult.cluster["id"];
  config.configHashes = [digestActionKey, digestCertificate];
  config.hosts[config["baseUrl"]].clusters[clusterResult.cluster["id"]] = {
    hashes: {}
  }
  config.hosts[config["baseUrl"]].clusters[clusterResult.cluster["id"]].hashes[
    digestActionKey
  ] = ["manage", "create", "update"];
  config.hosts[config["baseUrl"]].clusters[clusterResult.cluster["id"]].hashes[
    digestCertificate
  ] = [];
  config["certificates"][
    digestCertificate
  ] = await serializeToBase64(privateKey);
  config.tokens[digestActionKey] = keyb64;
  if (!checkConfig(config)){
    console.error("invalid config created");
    return;
  }
  const digest = await sortedHash(["type=Config"], config["hosts"][config["baseUrl"]].hashAlgorithms[0]);
  return await createContent(
    {
      client,
      config,
      cluster: clusterResult.cluster["id"],
      value: new File([JSON.stringify(config)], "value"),
      pubkeys: [publicKey],
      privkeys: [privateKey],
      tags: ["type=Config", "state=internal"],
      contentHash: digest,
      hashAlgorithm: config["hosts"][config["baseUrl"]].hashAlgorithms[0]
    }
  ).then(() => {
    return [config, clusterResult.cluster.id as string];
    })
}


export async function decryptContentObject(
  config: ConfigInterface | PromiseLike<ConfigInterface>,
  nodeData: any | PromiseLike<any>, blobOrAuthinfo : Blob | string | AuthInfoInterface | PromiseLike<Blob | string | AuthInfoInterface>)
{
  let arrPromise : PromiseLike<ArrayBufferLike>;
  const _info = await blobOrAuthinfo;
  const _node = await nodeData;
  if (_info instanceof Blob) {
    arrPromise = _info.arrayBuffer();
  } else if (typeof(_info) == "string") {
    arrPromise = Promise.resolve(b64toarr(_info).buffer)
  } else {
    arrPromise = fetch(
      _node.link, {
        headers: {
          "Authorization": _info.keys.join(",")
        }
      }
    ).then((result) => result.arrayBuffer());
  }
  if (_node.tags.includes("type=PublicKey")){
    return await arrPromise;
  }
  const found = findCertCandidatesForRefs(await config, _node);
  if (!found){
    return null;
  }
  const sharedkeyPromise = Promise.any(found.map((value) => decryptRSAOEAP({
    key: value[0], data: value[1]
  })));
  return await decryptAESGCM({
    key: (await sharedkeyPromise).data,
    nonce: _node.nonce,
    data: arrPromise
  });
}

export async function decryptContentId(client: ApolloClient<any>, config: ConfigInterface | PromiseLike<ConfigInterface>, activeUrl: string, contentId: string){
  const _config = await config;
  const authinfo : AuthInfoInterface = extractAuthInfo(_config, activeUrl);
  let result;
  // TODO: maybe remove try catch
  try{
    result = await client.query({
      query: contentQuery,
      variables: {
        id: contentId,
        keyhashes: authinfo.hashes.map((value) => `hash=${value}`)
      }
    });
  }catch(error){
    console.error("fetching failed", error);
    return null;
  }
  if(!result.data){
    return null;
  }
  return await decryptContentObject(
    _config, result.data.content, authinfo
  );
  }
