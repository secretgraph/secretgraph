export function toBase64(inp: string) {
  const codeUnits = new Uint16Array(inp.length);
  for (let i = 0; i < codeUnits.length; i++) {
    codeUnits[i] = inp.charCodeAt(i);
  }
return new Uint8Array(codeUnits.buffer);
}
