

import { utf8encoder } from "./misc";
import {
  CryptoRSAInInterface,
  CryptoRSAOutInterface,
  CryptoGCMInInterface,
  CryptoGCMOutInterface,
  PWInterface,
  RawInput,
  KeyInput,
  KeyOutInterface
} from "../interfaces"
import { mapHashNames, mapEncryptionAlgorithms } from "../constants";

export async function toPBKDF2key(inp: RawInput | PromiseLike<RawInput>) : Promise<CryptoKey>{
  let data : ArrayBuffer;
  const _inp = await inp;
  if (typeof(_inp) === "string"){
    data = utf8encoder.encode(_inp)
  } else if ( _inp instanceof ArrayBuffer || (_inp as any).buffer instanceof ArrayBuffer ) {
    data = _inp as ArrayBuffer;
  } else if ( _inp instanceof File ) {
    data = await (_inp as File).arrayBuffer();
  } else if ( _inp instanceof CryptoKey ) {
    if ((_inp as CryptoKey).algorithm.name != "PBKDF2"){
      throw Error("Invalid algorithm: "+(_inp as CryptoKey).algorithm.name)
    }
    return _inp as CryptoKey;
  } else {
    throw Error(`Invalid input: ${_inp} (${(_inp as RawInput).constructor})`)
  }

  return crypto.subtle.importKey(
    "raw",
    data,
    "PBKDF2",
    false,
    mapEncryptionAlgorithms.PBKDF2.usages
  );
}


export async function toPublicKey(inp: KeyInput | PromiseLike<KeyInput>, params: any) {
  let _key: CryptoKey;
  const _inp = await inp;
  if (_inp instanceof CryptoKey){
    _key = _inp;
  } else if ((_inp as CryptoKeyPair).privateKey && (_inp as CryptoKeyPair).publicKey){
    _key = (_inp as CryptoKeyPair).privateKey;
  } else if(params.name.startsWith("AES-")){
    // symmetric
    return await crypto.subtle.importKey(
      "raw" as const,
      await unserializeToArrayBuffer(_inp as RawInput),
      params,
      true,
      mapEncryptionAlgorithms[params.name].usages
    );
  } else {
    _key = await crypto.subtle.importKey(
      "pkcs8" as const,
      await unserializeToArrayBuffer(_inp as RawInput),
      params,
      true,
      mapEncryptionAlgorithms[`${params.name}private`].usages
    );
  }
  const tempkey = await crypto.subtle.exportKey(
    "jwk", _key
  );
  // remove private data from JWK
  delete tempkey.d;
  delete tempkey.dp;
  delete tempkey.dq;
  delete tempkey.q;
  delete tempkey.qi;
  tempkey.key_ops = ["sign", "verify", "encrypt", "decrypt"];
  return await crypto.subtle.importKey(
    "jwk", tempkey, params, true,
    mapEncryptionAlgorithms[`${params.name}public`].usages
  );
}

export function rsaKeyTransform(privKey:CryptoKey, hashalgo: string, options={pubkey: false, signkey: false}) {
  const ret : {
    pubkey?: Promise<CryptoKey>,
    signkey?: Promise<CryptoKey>
  } = {};
  if (options["signkey"]){
    ret["signkey"] = unserializeToCryptoKey(
      privKey, {
        name: "RSA-PSS",
        hash: hashalgo
      }
    );
  }
  if (options["pubkey"]){
    ret["pubkey"] = toPublicKey(privKey, {
        name: "RSA-OAEP",
        hash: hashalgo
      }
    );
  }
  return ret;
}

export async function unserializeToArrayBuffer(
  inp: RawInput | KeyOutInterface| PromiseLike<RawInput | KeyOutInterface>
) : Promise<ArrayBuffer> {
  const _inp = await inp;
  let _result : ArrayBuffer;
  if (typeof(_inp) === "string"){
    _result = Uint8Array.from(atob(_inp), c => c.charCodeAt(0));
  } else {
    let _data;
    const _finp = (_inp as KeyOutInterface).data
    if (_finp && (_finp instanceof ArrayBuffer || (_finp as any).buffer instanceof ArrayBuffer)){
      _data = _finp;
    } else {
      _data = _inp
    }
    if ( _data instanceof ArrayBuffer || (_data as any).buffer instanceof ArrayBuffer ) {
      _result = _data as ArrayBuffer;
    } else if ( _data instanceof File ) {
      _result = await (_data as File).arrayBuffer();
    } else if ( _data instanceof CryptoKey ) {
      switch (_data.type){
        case "public":
          // serialize publicKey
          _result = await crypto.subtle.exportKey(
            "spki" as const,
            _data
          );
          break
        case "private":
          _result = await crypto.subtle.exportKey(
            "pkcs8" as const,
            _data
          );
          break
        default:
          _result = await crypto.subtle.exportKey(
            "raw" as const,
            _data
          )
      }
    } else {
      throw Error(`Invalid input: ${_inp} (${(_inp as RawInput).constructor})`)
    }
  }
  return _result;
}

export async function serializeToBase64(inp: RawInput | KeyOutInterface | PromiseLike<RawInput | KeyOutInterface>) : Promise<string> {
  return btoa(String.fromCharCode(... new Uint8Array(await unserializeToArrayBuffer(inp))))
}

function compareObjects(obj1: any, obj2: any){
  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  for (const key of keys){
    if (obj1[key] != obj2[key]){
      return false;
    }
  }
  return true;
}

export async function unserializeToCryptoKey(inp: KeyInput | PromiseLike<KeyInput>, params: any, type: "privateKey" | "publicKey" = "publicKey") : Promise<CryptoKey> {
  let _data: ArrayBuffer, _result: CryptoKey;
  const temp1 = await inp;
  if (temp1 instanceof CryptoKey){
    if (compareObjects(temp1.algorithm, params) && type.startsWith(temp1.type)){
      return temp1;
    }
    if (type == "publicKey" && temp1.type == "private"){
      return await toPublicKey(temp1, params);
    }
    _data = await unserializeToArrayBuffer(temp1);
  } else if ((temp1 as CryptoKeyPair).privateKey && (temp1 as CryptoKeyPair).publicKey){
    let temp2 = (temp1 as CryptoKeyPair)[type];
    if (compareObjects(temp2.algorithm, params)){
      return temp2;
    }
    _data = await unserializeToArrayBuffer(temp2);
  } else {
    _data = await unserializeToArrayBuffer(temp1 as RawInput);
  }
  if (params.name.startsWith("AES-")){
    // symmetric
    _result = await crypto.subtle.importKey(
      "raw" as const,
      _data,
      params,
      true,
      mapEncryptionAlgorithms[params.name].usages
    )
  } else {
    try {
      _result = await crypto.subtle.importKey(
        "pkcs8" as const,
        _data,
        params,
        true,
        mapEncryptionAlgorithms[`${params.name}private`].usages
      )
      if (type == "publicKey"){
        _result = await toPublicKey(_result, params);
      }
    } catch(exc){
      if (type == "publicKey"){
        // serialize publicKey
        _result = await crypto.subtle.importKey(
          "spki" as const,
          _data,
          params,
          true,
          mapEncryptionAlgorithms[`${params.name}public`].usages
        )
      } else {
        throw Error("Not a PrivateKey")
      }
    }
}
  return _result;
}

export async function encryptRSAOEAP(options: CryptoRSAInInterface | Promise<CryptoRSAInInterface>) : Promise<CryptoRSAOutInterface> {
  const _options = await options;
  const hashalgo = await _options.hashAlgorithm;
  if(!mapHashNames[""+hashalgo]){
    throw Error("hashalgorithm not supported: "+hashalgo)
  }
  const key = await unserializeToCryptoKey(_options.key, {
    name: "RSA-OAEP",
    hash: mapHashNames[""+hashalgo].name
  });
  return {
    data: await crypto.subtle.encrypt(
      {
        name: "RSA-OAEP"
      },
      key,
      await unserializeToArrayBuffer(_options.data)
    ),
    hashAlgorithm: hashalgo as string,
    key
  }
}

export async function decryptRSAOEAP(options: CryptoRSAInInterface | Promise<CryptoRSAInInterface>) : Promise<CryptoRSAOutInterface> {
  const _options = await options;
  let hashalgo: string, nonce: ArrayBuffer | undefined = undefined, key: CryptoKey;
  const _key = await _options.key;
  if (typeof(_key) === "string"){
    const split = _key.split(":");
    switch (split.length){
      case 1:
        const _hashalgo = await _options.hashAlgorithm;
        if(!mapHashNames[""+_hashalgo]){
          throw Error("hashalgorithm not supported: "+_hashalgo)
        }
        hashalgo = mapHashNames[""+_hashalgo].name;
        key = await unserializeToCryptoKey(split[0], {
          name: "RSA-OAEP",
          hash: hashalgo
        }, "privateKey")
        break
      case 2:
        const _hashalgo2 = await _options.hashAlgorithm;
        if(!mapHashNames[""+_hashalgo2]){
          throw Error("hashalgorithm not supported: "+_hashalgo2)
        }
        hashalgo = mapHashNames[""+_hashalgo2].name;
        [nonce, key] = [
          await unserializeToArrayBuffer(split[0]),
          await unserializeToCryptoKey(split[1], {
            name: "RSA-OAEP",
            hash: hashalgo
          }, "privateKey")
        ];
        break
      default:
        let _hashalgo3;
        [_hashalgo3, nonce] = [
          split[0],
          await unserializeToArrayBuffer(split[1]),
        ];
        if(!mapHashNames[""+_hashalgo3]){
          throw Error("hashalgorithm not supported: "+_hashalgo3)
        }
        hashalgo = mapHashNames[""+_hashalgo3].name;
        key = await unserializeToCryptoKey(split[2], {
          name: "RSA-OAEP",
          hash: hashalgo
        }, "privateKey")
        break
    }
  } else {
    const _hashalgo = await _options.hashAlgorithm;
    if(!mapHashNames[""+_hashalgo]){
      Error("hashalgorithm not supported: "+_hashalgo)
    }
    hashalgo = mapHashNames[""+_hashalgo].name;
    key = await unserializeToCryptoKey(_key, {
      name: "RSA-OAEP",
      hash: hashalgo
    }, "privateKey")
  }
  return {
    data: await crypto.subtle.decrypt(
      {
        name: "RSA-OAEP"
      },
      key,
      await unserializeToArrayBuffer(_options.data)
    ),
    key,
    hashAlgorithm: hashalgo,
    nonce
  }
}

export async function encryptAESGCM(options: CryptoGCMInInterface | Promise<CryptoGCMInInterface>) : Promise<CryptoGCMOutInterface> {
  const _options = await options;
  const nonce = _options.nonce ? await unserializeToArrayBuffer(_options.nonce) : crypto.getRandomValues(new Uint8Array(13));
  const key = await unserializeToCryptoKey(_options.key, {
    name: "AES-GCM"
  }, "publicKey")
  return {
    data: await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce
      },
      key,
      await unserializeToArrayBuffer(_options.data)
    ),
    key,
    nonce
  }
}
export async function decryptAESGCM(options: CryptoGCMInInterface | Promise<CryptoGCMInInterface>) : Promise<CryptoGCMOutInterface> {
  const _options = await options;
  const _key = await _options.key;
  const _nonce = _options.nonce ? await unserializeToArrayBuffer(_options.nonce) : undefined;
  let nonce: ArrayBuffer, key: CryptoKey;
  if (typeof(_key) === "string"){
    const split = _key.split(":");
    switch (split.length){
      case 1:
        if (!_nonce){
          throw Error("No nonce found");
        }
        nonce = _nonce;
        key = await unserializeToCryptoKey(split[0], {
          name: "AES-GCM",
        }, "privateKey")
        break
      case 2:
        nonce = await unserializeToArrayBuffer(split[0]);
        key = await unserializeToCryptoKey(split[1], {
          name: "AES-GCM",
        }, "privateKey");
        break
      default:
        nonce = await unserializeToArrayBuffer(split[1]);
        key = await unserializeToCryptoKey(split[2], {
          name: "AES-GCM",
        }, "privateKey");
        break
    }
  } else {
    if (!_nonce){
      throw Error("No nonce found");
    }
    nonce = _nonce;
    key = await unserializeToCryptoKey(_key, {
      name: "AES-GCM",
    }, "privateKey")
  }
  return {
    data: await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce
      },
      key,
      await unserializeToArrayBuffer(_options.data)
    ),
    key,
    nonce
  }
}

export async function derivePW(options: PWInterface) : Promise<{data: ArrayBuffer, key: CryptoKey}> {
  const key = await toPBKDF2key(options.pw)
  const salt = await unserializeToArrayBuffer(options.salt);
  const iterations = parseInt(""+await options.iterations);
  const hashalgo = await options.hashalgo;

  return {
    "data": await crypto.subtle.deriveBits(
      {
        "name": "PBKDF2",
        salt: salt,
        "iterations": iterations,
        "hash": mapHashNames[""+hashalgo] ? mapHashNames[""+hashalgo].name : "SHA-512"
      },
      key,
      mapHashNames[""+hashalgo] ? mapHashNames[""+hashalgo].length : 512
    ),
    "key": key
  }
}


export async function pwencryptprekey(prekey: ArrayBuffer, pw: string, iterations: number){
  const nonce = crypto.getRandomValues(new Uint8Array(13));
  const key = (await derivePW({pw, salt: nonce, iterations})).data;
  const { data } = await encryptAESGCM(
    {
      nonce, key, data: prekey
    }
  );
  return `${btoa(String.fromCharCode(...nonce))}${btoa(String.fromCharCode(...new Uint8Array(data)))}`
}

async function _pwsdecryptprekey(prekey: ArrayBuffer | string, pws: string[], iterations: number){
  let prefix = null;
  if (typeof prekey === "string"){
    const _prekey = prekey.split(':', 1);
    if(_prekey.length > 1){
      prefix = _prekey[0];
      prekey = Uint8Array.from(atob(_prekey[1]), c => c.charCodeAt(0));
    } else {
      prekey = Uint8Array.from(atob(_prekey[0]), c => c.charCodeAt(0));
    }
  }
  const nonce = new Uint8Array(prekey.slice(0, 13));
  const realkey = prekey.slice(13);
  const decryptprocesses = [];
  for(const pw of pws){
    decryptprocesses.push(
      decryptAESGCM({
        data: realkey,
        key: (await derivePW({pw, salt: nonce, iterations})).data,
        nonce: nonce
      })
    )
  }
  return [await Promise.any(decryptprocesses).then(obj => obj.data), prefix];
}

export async function pwsdecryptprekeys(prekeys: ArrayBuffer[] | string[], pws: string[], iterations: number){
  const decryptprocesses = [];
  for(const prekey of prekeys){
    decryptprocesses.push(_pwsdecryptprekey(prekey, pws, iterations));
  }
  const results = [];
  for(const res of await Promise.allSettled(decryptprocesses)){
    if ((res as any)["value"]){
      results.push((res as PromiseFulfilledResult<[ArrayBuffer, string | null]>).value);
    }
  };
  return results;
}

export async function pwsdecryptprekeys_first(prekeys: ArrayBuffer[] | string[], pws: string[], iterations: number, fn?: any){
  const decryptprocesses = [];
  for(const prekey of prekeys){
    if (fn){
      decryptprocesses.push(_pwsdecryptprekey(prekey, pws, iterations).then(fn));
    } else {
      decryptprocesses.push(_pwsdecryptprekey(prekey, pws, iterations));
    }

  }
  return await Promise.any(decryptprocesses);
}
