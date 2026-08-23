/**
 * JSON codec for accumulator state.
 *
 * Accumulators store their state in Maps and Sets, and `JSON.stringify` turns
 * both into `{}` without complaining — a silent, total data loss. Everything
 * that crosses the sidecar boundary goes through here first.
 *
 * The `__map` / `__set` sentinels are only honoured when their payload is an
 * array, so a plain object that happens to carry a `__map` string key survives
 * as itself.
 */

const MAP_KEY = '__map';
const SET_KEY = '__set';

export function encodeState(value: unknown): unknown {
    if (value instanceof Map) {
        return { [MAP_KEY]: [...value.entries()].map(([k, v]) => [encodeState(k), encodeState(v)]) };
    }
    if (value instanceof Set) {
        return { [SET_KEY]: [...value].map(encodeState) };
    }
    if (Array.isArray(value)) return value.map(encodeState);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encodeState(v);
        return out;
    }
    return value;
}

export function decodeState(value: unknown): any {
    if (Array.isArray(value)) return value.map(decodeState);
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (Array.isArray(obj[MAP_KEY])) {
            const entries = obj[MAP_KEY] as Array<[unknown, unknown]>;
            return new Map(entries.map(([k, v]) => [decodeState(k), decodeState(v)]));
        }
        if (Array.isArray(obj[SET_KEY])) {
            return new Set((obj[SET_KEY] as unknown[]).map(decodeState));
        }
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) out[k] = decodeState(v);
        return out;
    }
    return value;
}
