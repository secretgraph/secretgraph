
export const utf8encoder = new TextEncoder();

export function utf8ToBinary(inp: string) : string {
  return String.fromCharCode(...utf8encoder.encode(inp));
}

export function b64toarr(inp: string){
  return Uint8Array.from(atob(inp), c => c.charCodeAt(0));
}
