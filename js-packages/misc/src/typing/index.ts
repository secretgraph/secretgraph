export type UnpackPromise<T> = T extends PromiseLike<infer U> ? U : T
export type ValueType<T extends object> = T[keyof T]
export type EntryType<T extends object, K extends keyof T = keyof T> = [
    K,
    T[K]
]
export type MaybePromise<T> = T | PromiseLike<T>
export type DistributivePick<
    T extends object,
    K extends keyof T
> = T extends unknown ? Pick<T, K> : never
export type DistributiveOmit<
    T extends object,
    K extends keyof T
> = T extends unknown ? Omit<T, K> : never
export type RequireAttributes<T extends object, P extends keyof T> = Omit<
    T,
    P
> &
    Required<Pick<T, P>>
export type OptionalAttributes<T extends object, P extends keyof T> = Omit<
    T,
    P
> &
    Partial<Pick<T, P>>
export type Writeable<T> = { -readonly [P in keyof T]: T[P] }
