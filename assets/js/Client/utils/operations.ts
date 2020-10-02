import { createClusterMutation } from "../queries/cluster";
import { createContentMutation, contentQuery } from "../queries/content";
import { serverConfigQuery } from "../queries/server";
import { ConfigInterface, ReferenceInterface, ActionInterface, AuthInfoInterface } from "../interfaces";
import { b64toarr, sortedHash, utf8encoder } from "./misc";
import { arrToGCMKey, arrToRSAOEPkey, rsaKeyTransform } from "./encryption";
import { ApolloClient } from '@apollo/client';
import { checkConfig, extractAuthInfo, findCertCandidatesForRefs } from "./config";
import { createContentAuth, encryptSharedKey, hashContent } from "./graphql";
import { mapHashNames } from "../constants"


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
      arrToGCMKey(key), options.value.arrayBuffer()
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
        arrToGCMKey(privateKeyKey),
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
      config.hosts[config.baseUrl].hashAlgorithms[0],
      keydata
    ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data)))));
    const digestActionKeyPromise = crypto.subtle.digest(
      config.hosts[config.baseUrl].hashAlgorithms[0],
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
      ] = await crypto.subtle.exportKey(
        "pkcs8" as const,
        privateKey
      ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data))));
      config.tokens[digestActionKey] = keyb64;
      if (!checkConfig(config)){
        console.error("invalid config created");
        return;
      }
      const digest = await sortedHash(["type=Config"], config["hosts"][config["baseUrl"]].hashAlgorithms[0]);
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
          hashAlgorithm: config["hosts"][config["baseUrl"]].hashAlgorithms[0]
        }
      ).then(() => {
        return [config, clusterResult.cluster.id as string];
      })
    })
  }


  export async function decryptContentObject(
    config: ConfigInterface,
    nodeData: any, blobOrAuthinfo : Blob | string | AuthInfoInterface)
  {
    let arrPromise : PromiseLike<ArrayBufferLike>;
    if (blobOrAuthinfo instanceof Blob) {
      arrPromise = blobOrAuthinfo.arrayBuffer();
    } else if (typeof(blobOrAuthinfo) == "string") {
      arrPromise = Promise.resolve(b64toarr(blobOrAuthinfo).buffer)
    } else {
      arrPromise = fetch(
        nodeData.link, {
          headers: {
            "Authorization": blobOrAuthinfo.keys.join(",")
          }
        }
      ).then((result) => result.arrayBuffer());
    }
    if (nodeData.tags.includes("type=PublicKey")){
      return await arrPromise;
    }
    const found = findCertCandidatesForRefs(config, nodeData);
    if (!found){
      return null;
    }
    const sharedkeyPromise = Promise.any(found.map((value) => arrToRSAOEPkey(value[0]).then(
      (privkey) => crypto.subtle.decrypt(
        {
          name: "RSA-OAEP",
        },
        privkey,
        value[1]
      )
    ))).then(arrToRSAOEPkey);
    return await Promise.all(
      [sharedkeyPromise, arrPromise]
    ).then(([sharedkey, arr]) => crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      sharedkey,
      arr
    ));
  }

  export async function decryptContentId(client: ApolloClient<any>, config: ConfigInterface, activeUrl: string, contentId: string){
    const authinfo : AuthInfoInterface = extractAuthInfo(config, activeUrl);
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
      config, result.data.content, authinfo
    );
  }
