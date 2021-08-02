export const utf8encoder = new TextEncoder()
export const utf8decoder = new TextDecoder()

export function utf8ToBinary(inp: string): string {
    return String.fromCharCode(...utf8encoder.encode(inp))
}

export function b64toarr(inp: string) {
    return new Uint8Array(Buffer.from(inp, 'base64').buffer)
}
export function b64toutf8(inp: string) {
    return utf8decoder.decode(b64toarr(inp))
}

export async function sortedHash(inp: string[], algo: string): Promise<string> {
    return await crypto.subtle
        .digest(algo, utf8encoder.encode(inp.sort().join('')))
        .then((data) => Buffer.from(data).toString('base64'))
}

export function mergeDeleteObjects(
    oldObj: any,
    newObj: any,
    objHandler: (a: any, b: any) => [any, number] = mergeDeleteObjects
): [any, number] {
    let count = 0

    const copied = oldObj ? Object.assign({}, oldObj) : {}
    for (const [key, value] of Object.entries(newObj)) {
        if (!key) {
            continue
        }
        if (value === null) {
            if (copied[key]) {
                delete copied[key]
                count++
            }
        } else if (typeof value === 'object') {
            const ret = objHandler(copied[key], value)
            copied[key] = ret[0]
            count += ret[1]
        } else if (value !== undefined) {
            if (copied[key] != value) {
                copied[key] = value
                count++
            }
        }
    }
    return [copied, count]
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
