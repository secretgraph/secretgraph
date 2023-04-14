import { isNotEq } from './set'

export class InvalidMergeError extends Error {}

export function compareArray(a: any[], b: any[]) {
    if (a.length != b.length) {
        return false
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] != b[i]) {
            return false
        }
    }
    return true
}

export function mergeDeleteObjects(
    targetObj: any,
    update: any,
    objHandler: (
        a: any,
        b: any
    ) => [any, number] | undefined = mergeDeleteObjects
): [any, number] {
    let count = 0

    const copied = targetObj ? Object.assign({}, targetObj) : {}
    for (const [key, value] of Object.entries(update)) {
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
            if (ret) {
                copied[key] = ret[0]
                count += ret[1]
            }
        } else if (value !== undefined) {
            if (copied[key] != value) {
                copied[key] = value
                count++
            }
        }
    }
    return [copied, count]
}

export function mergeDeleteObjectsReplace(
    targetObj: any,
    update: any,
    objHandler: (
        a: any,
        b: any
    ) => [any, number] | undefined = mergeDeleteObjectsReplace
): [any, number] {
    return mergeDeleteObjects(targetObj, update, (a: any, b: any) => {
        if (b instanceof Array) {
            if (!a || !compareArray(a, b)) {
                return [b, 1]
            }
        } else if (b instanceof Set) {
            if (!a || isNotEq(a, b)) {
                return [b, 1]
            }
        } else {
            return objHandler(a, b)
        }
    })
}

export function multiAssign(
    target: any,
    update: any,
    keys: string[],
    ignoreNull: boolean = false
): [any, number] {
    let count = 0

    for (const key of keys) {
        const value = update[key]
        if (value !== undefined && (!ignoreNull || value !== null)) {
            if (
                target[key] instanceof Array &&
                !compareArray(value, target[key])
            ) {
                count += 1
                target[key] = value
            } else if (
                target[key] instanceof Set &&
                isNotEq(value, target[key])
            ) {
                count += 1
                target[key] = value
            } else if (value !== target[key]) {
                count += 1
                target[key] = value
            }
        }
    }

    return [target, count]
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
    retryInterval = 3000,
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

export function is_pwa(): boolean {
    return window.matchMedia(
        '(display-mode: fullscreen), (display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)'
    ).matches
}

export async function fallback_fetch(
    input: RequestInfo | URL,
    init?: Omit<NonNullable<RequestInit>, 'cache'>
) {
    let result
    let init_used: RequestInit = init
        ? {
              ...init,
              cache: 'no-cache',
              credentials: init.credentials ? init.credentials : 'omit',
              mode: init.mode ? init.mode : 'no-cors',
          }
        : { cache: 'no-cache', credentials: 'omit', mode: 'no-cors' }
    try {
        result = await fetch(input, init_used)
    } catch (exc) {
        result = null
    }
    if (!result || !result.ok) {
        result = await fetch(input, { ...init_used, cache: 'force-cache' })
    }

    if (!result.ok) {
        throw new Error('Could not fetch content: ' + result.statusText)
    }
    return result
}
