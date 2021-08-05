export declare type UnpackPromise<T> = T extends PromiseLike<infer U> ? U : T;
export declare type ValueType<T extends object> = T[keyof T];
export declare type EntryType<T extends object, K extends keyof T = keyof T> = [K, T[K]];
export declare type DistributivePick<T extends object, K extends keyof T> = T extends unknown ? Pick<T, K> : never;
export declare type DistributiveOmit<T extends object, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export declare type RequireAttributes<T extends object, P extends keyof T> = Omit<T, P> & Required<Pick<T, P>>;
export declare type OptionalAttributes<T extends object, P extends keyof T> = Omit<T, P> & Partial<Pick<T, P>>;
