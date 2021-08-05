export declare function isSuperset<T>(set: Set<T>, subset: Iterable<T>): boolean;
export declare function union<T>(setA: Iterable<T>, setB: Iterable<T>): Set<T>;
export declare function hasIntersection<T>(setA: Set<T>, elements: Iterable<T>): boolean;
export declare function intersection<T>(setA: Set<T>, setB: Iterable<T>): Set<T>;
export declare function symmetricDifference<T>(setA: Set<T>, setB: Iterable<T>): Set<T>;
export declare function difference<T>(setA: Iterable<T>, setB: Iterable<T>): Set<T>;
export declare function isNotEq<T>(setA: Set<T>, elements: Iterable<T>): boolean;
