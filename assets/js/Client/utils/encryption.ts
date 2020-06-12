

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
    ["encrypt" as const, "decrypt" as const]
  );
}

export async function PBKDF2PW(inp: string, salt: Uint8Array, iterations: number) {
  return await window.crypto.subtle.deriveBits(
    {
      "name": "PBKDF2",
      salt: salt,
      "iterations": iterations,
      "hash": "SHA-256"
    },
    await strtoPBKDF2key(inp),
    512
  );
}
