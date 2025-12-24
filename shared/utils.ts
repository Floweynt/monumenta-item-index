export function merge<T extends object, U extends object>(target: T, obj: U): T & U {
    const newObj = {...target, };

    Object.entries(obj).forEach(([k, v]) => {
        (newObj as {[key: string]: unknown})[k] = v ?? (newObj as {[key: string]: unknown})[k];
    });

    return newObj as T & U;
}

export function findKey(val: object, key: string, func: (val: object, key: string, x: unknown) => void) {
    if (Array.isArray(val)) {
        val.forEach(v => {
            if (typeof v === "object")
                findKey(v, key, func);
        });

        return;
    }

    if ((val as any)[key] !== undefined) {
        func(val, key, (val as any)[key]);
    }

    Object.values(val).forEach(v => {
        if (typeof v === "object")
            findKey(v, key, func);
    });
}

export function nonnull<T>(arg: T | undefined | null): T {
    if (arg === undefined || arg === null)
        throw Error("argument should be nonnull");

    return arg;
}

export function getSafe<T>(dict: {[key: string]: T}, key: string): T {
    if (dict[key] === undefined)
        throw Error(`undefined key ${key}`);

    return dict[key];
}

export function getOrDefault<T>(dict: {[key: string]: T}, key: string, def: T): T {
    if (dict[key] === undefined)
        return def;
    return dict[key];
}

export type ArbitrarilyNested<T> = T | ArbitrarilyNested<T>[];

export function flatOf<T>(a: ArbitrarilyNested<T>): T[] {
    if (!Array.isArray(a))
        return [a];
    return a.flatMap(u => flatOf(u));
}

export function unique<T>(arr: T[]): T[] {
    return [...new Set(arr.map(u => JSON.stringify(u)))].map(u => JSON.parse(u)) as T[];
}

export function mappingUnique<T>(arr: T[], mapper: (x: T) => unknown): T[] {
    const set = new Set<unknown>();
    return arr.flatMap(u => {
        const res = mapper(u);
        if (set.has(res))
            return [];
        set.add(res);
        return [u];
    });
}

export function mapPrim<T, U>(v: T | undefined | null, func: (i: T) => U): U | undefined {
    if (v === undefined || v === null)
        return;

    return func(v);
}

export function duplicates<T>(arr: T[], keyGetter = (x: T): unknown => x) {
    const unique = new Set<unknown>();
    const dup: T[] = [];

    for (let i = 0; i < arr.length; i++) {
        const key = keyGetter(arr[i]);
        if (unique.has(key)) {
            dup.push(arr[i]);
        }
        unique.add(key);
    }

    return Array.from(new Set(dup));
}
