export function mergeDeleteObjects(
    targetObj: any,
    newObj: any,
    objHandler: (a: any, b: any) => [any, number] = mergeDeleteObjects
): [any, number] {
    let count = 0

    const copied = targetObj ? Object.assign({}, targetObj) : {}
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

export async function retry<T>({
    action,
    retryInterval = 5000,
    maxAttempts = 3,
}: {
    action: (attempted: number) => Promise<T> | T
    retryInterval?: number
    maxAttempts?: number
}): Promise<T> {
    const exceptions = []
    for (let attempted = 0; attempted < maxAttempts; attempted++) {
        try {
            if (attempted > 0) {
                await sleep(retryInterval)
            }
            return await action(attempted)
        } catch (e) {
            exceptions.push(e)
        }
    }

    throw exceptions
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
