export function* map<T, R>(
    it: Iterable<T>,
    fn: (el: T, index: number) => R
): Iterable<R> {
    let index = 0
    for (const el of it) {
        yield fn(el, index)
        index++
    }
}
