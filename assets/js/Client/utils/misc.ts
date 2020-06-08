export function utf8ToBase64(inp: string) : string {
  const codeUnits = new Uint16Array(inp.length);
  for (let i = 0; i < codeUnits.length; i++) {
    codeUnits[i] = inp.charCodeAt(i);
  }
return btoa(String.fromCharCode(...new Uint8Array(codeUnits.buffer)));
}
