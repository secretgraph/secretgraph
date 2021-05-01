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

export async function sortedHash(inp: string[], algo: string): Promise<string> {
    return await crypto.subtle
        .digest(algo, utf8encoder.encode(inp.sort().join('')))
        .then((data) => btoa(String.fromCharCode(...new Uint8Array(data))))
}

export function mergeDeleteObjects(
    oldObj: any,
    newObj: any,
    objHandler = (oldval: any, newval: any) => newval
) {
    const copied = oldObj ? Object.assign({}, oldObj) : {}
    for (const [key, value] of Object.entries(newObj)) {
        if (!key) {
            continue
        }
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

export function deepEqual<T>(a: T, b: T) {
    if (a === null || b === null) {
        return a === b
    }
    if (a instanceof Set || b instanceof Set) {
        if (!(a instanceof Set && b instanceof Set)) {
            return false
        }
        if (a.size != b.size) {
            return false
        }
        for (const key of a) {
            if (!b.has(key)) {
                return false
            }
        }
        return true
    } else if (typeof a == 'object' && typeof b == 'object') {
        const keys = new Set<string>()
        for (const key of a instanceof Array || a instanceof Map
            ? a.keys()
            : Object.keys(a)) {
            keys.add(key)
        }
        for (const key of b instanceof Array || b instanceof Map
            ? b
            : Object.keys(b)) {
            keys.add(key)
        }
        for (const key of keys) {
            if (!deepEqual((a as any)[key], (b as any)[key])) {
                return false
            }
        }
        return true
    } else {
        return a === b
    }
}
