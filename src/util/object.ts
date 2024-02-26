/**
 * Simple object check.
 */
export function isObject(item: any) {
    return item && typeof item === "object" && !Array.isArray(item);
}

/**
 * Deep merge two objects.
 */
export function deepMerge<T>(
    target: Record<any, any>,
    ...sources: Record<any, any>[]
): T {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                deepMerge(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return deepMerge(target, ...sources) as T;
}
