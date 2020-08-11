

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

export function arrtogcmkey(inp: ArrayBuffer | string){
  if (typeof inp === "string"){
    inp = Uint8Array.from(atob(inp), c => c.charCodeAt(0)).buffer;
  }
  return crypto.subtle.importKey(
    "raw" as const,
    inp,
    "AES-GCM" as const,
    false,
    ["encrypt" as const, "decrypt" as const, "wrapKey", "unwrapKey"]
  );
}

export async function pwencryptprekey(prekey: ArrayBuffer, pw: string, iterations: number){
  const nonce = crypto.getRandomValues(new Uint8Array(13));
  const key = await PBKDF2PW(pw, nonce, iterations);
  const encrypted_prekey = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce
    },
    await arrtogcmkey(key),
    prekey
  );
  return btoa(String.fromCharCode(...nonce, ...new Uint8Array(encrypted_prekey)));
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
      crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonce
        },
        await PBKDF2PW(pw, nonce, iterations).then((key) => arrtogcmkey(key)),
        realkey
      )
    )
  }
  return [await Promise.any(decryptprocesses), prefix];
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
