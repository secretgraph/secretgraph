// taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set

export function isSuperset<T>(set: Set<T>, subset: Iterable<T>) {
    for (let elem of subset) {
        if (!set.has(elem)) {
            return false
        }
    }
    return true
}

export function union<T>(setA: Iterable<T>, setB: Iterable<T>) {
    let _union = new Set(setA)
    for (let elem of setB) {
        _union.add(elem)
    }
    return _union
}
export function hasIntersection<T>(setA: Set<T>, elements: Iterable<T>) {
    for (let elem of elements) {
        if (setA.has(elem)) {
            return true
        }
    }
    return false
}

export function intersection<T>(setA: Set<T>, setB: Iterable<T>) {
    let _intersection = new Set()
    for (let elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem)
        }
    }
    return _intersection
}

export function symmetricDifference<T>(setA: Set<T>, setB: Iterable<T>) {
    let _difference = new Set(setB)
    for (let elem of setA) {
        if (_difference.has(elem)) {
            _difference.delete(elem)
        } else {
            _difference.add(elem)
        }
    }
    return _difference
}

export function difference<T>(setA: Iterable<T>, setB: Iterable<T>) {
    let _difference = new Set(setA)
    for (let elem of setB) {
        _difference.delete(elem)
    }
    return _difference
}
export function isNotEq<T>(setA: Set<T>, elements: Iterable<T>) {
    let count = 0
    for (let elem of elements) {
        if (!setA.has(elem)) {
            return true
        }
        count++
    }
    return setA.size != count
}
