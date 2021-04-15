export type UnpackPromise<T> = T extends PromiseLike<infer U> ? U : T
export type ValueType<T extends object> = T[keyof T]
