
export const utf8encoder = new TextEncoder();

export function utf8ToBinary(inp: string) : string {
  return String.fromCharCode(...utf8encoder.encode(inp));
}

export function b64toarr(inp: string){
  return Uint8Array.from(atob(inp), c => c.charCodeAt(0));
}


export function sortedHash(inp: string[], algo: string) : PromiseLike<string>{
  return crypto.subtle.digest(
    algo,
    utf8encoder.encode(inp.sort().join(""))
  ).then((data) => btoa(String.fromCharCode(... new Uint8Array(data))));
}
