

import { utf8encoder } from "./misc";

function strtoPBKDF2key(inp: string){
  return crypto.subtle.importKey(
    "raw" as const,
    utf8encoder.encode(inp),
    "PBKDF2" as const,
    false,
    ["deriveBits" as const, "deriveKey" as const]
  );
}

export function arrtogcmkey(inp: ArrayBuffer){
  return crypto.subtle.importKey(
    "raw" as const,
    inp,
    "AES-GCM" as const,
    false,
    ["encrypt" as const, "decrypt" as const, "wrapKey", "unwrapKey"]
  );
}

export function arrtorsaoepkey(inp: ArrayBuffer){
  return crypto.subtle.importKey(
    "pkcs8" as const,
    inp,
    {
      name: "RSA-OAEP",
      hash: "SHA-512"
    },
    true,
    ["encrypt", "unwrapKey", "decrypt", "wrapKey"]
  );
}

export function rsakeytransform(privKey:CryptoKey, hashalgo: string, options={pubkey: false, signkey: false}) {
  const ret : {
    pubkey?: PromiseLike<CryptoKey>,
    signkey?: PromiseLike<CryptoKey>
  } = {};
  if (options["signkey"]){
    ret["signkey"] = crypto.subtle.exportKey(
      "pkcs8", privKey
    ).then((data) => crypto.subtle.importKey(
        "pkcs8",
        data,
        {
          name: "RSA-PSS",
          hash: hashalgo
        },
        false,
        ["sign"]
      )
    );
  }
  if (options["pubkey"]){
    ret["pubkey"] = crypto.subtle.exportKey(
      "jwk", privKey
    ).then((data) => {
      // remove private data from JWK
      delete data.d;
      delete data.dp;
      delete data.dq;
      delete data.q;
      delete data.qi;
      data.key_ops = ["wrapKey", "encrypt"];
      return crypto.subtle.importKey(
        "jwk", data, {
          name: "RSA-OAEP",
          hash: hashalgo
        }, true, ["wrapKey", "encrypt"]);
      }
    );
  }
  return ret;
}


export function rsaoepkeytoarr(publicKey: CryptoKey){
  return crypto.subtle.exportKey(
    "spki" as const,
    publicKey
  )
}

export async function PBKDF2PW(inp: string, salt: Uint8Array, iterations: number) {
  return await window.crypto.subtle.deriveBits(
    {
      "name": "PBKDF2",
      salt: salt,
      "iterations": iterations,
      "hash": "SHA-512"
    },
    await strtoPBKDF2key(inp),
    256
  ).then((obj) => new Uint8Array(obj));
}
