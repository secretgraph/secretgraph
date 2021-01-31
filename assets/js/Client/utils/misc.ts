export const utf8encoder = new TextEncoder()
export const utf8decoder = new TextDecoder()

export function utf8ToBinary(inp: string): string {
    return String.fromCharCode(...utf8encoder.encode(inp))
}

export function b64toarr(inp: string) {
    return Uint8Array.from(atob(inp), (c) => c.charCodeAt(0))
}
export function b64toutf8(inp: string) {
    return utf8decoder.decode(b64toarr(inp))
}

export function sortedHash(inp: string[], algo: string): PromiseLike<string> {
    return crypto.subtle
        .digest(algo, utf8encoder.encode(inp.sort().join('')))
        .then((data) => btoa(String.fromCharCode(...new Uint8Array(data))))
}

export function mergeDeleteObjects(
    oldObj: any,
    newObj: any,
    objHandler = (oldval: any, newval: any) => newval
) {
    const copied = Object.create(oldObj || {})
    for (const [key, value] of Object.entries(newObj)) {
        if (value === null) {
            delete copied[key]
        } else if (typeof value === 'object') {
            copied[key] = objHandler(copied[key], value)
        } else {
            copied[key] = value
        }
    }
    return copied
}
