/**
 * axilog encodes every 1s series as `{ data, enc, interval_ms, len }`.
 *
 * `len` is authoritative, not `data.length`: an "rle" payload is a list of
 * [value, runLength] pairs whose runs may sum to less than `len` when the
 * value stops changing before the fight ends. These series are CUMULATIVE, so
 * a short run must be padded by REPEATING the last value — padding with zero
 * would make the next delta negative and silently zero out a player's tail.
 */
export const SERIES_INTERVAL_MS = 1000;

export interface NativeSeries {
    data: number[] | Array<[number, number]>;
    enc: string;
    interval_ms: number;
    len: number;
}

const fit = (values: number[], len: number): number[] => {
    if (values.length === len) return values;
    if (values.length > len) return values.slice(0, len);
    const last = values.length > 0 ? values[values.length - 1] : 0;
    return values.concat(new Array<number>(len - values.length).fill(last));
};

export const decodeSeries = (series: NativeSeries | null | undefined): number[] => {
    if (!series || !Array.isArray(series.data)) return [];
    const len = Number(series.len);
    if (!Number.isFinite(len) || len <= 0) return [];

    if (series.enc === 'raw') {
        const raw = (series.data as number[]).map((v) => Number(v) || 0);
        return fit(raw, len);
    }
    if (series.enc !== 'rle') return [];

    const out: number[] = [];
    for (const pair of series.data as Array<[number, number]>) {
        if (!Array.isArray(pair)) continue;
        const value = Number(pair[0]) || 0;
        const run = Number(pair[1]) || 0;
        for (let i = 0; i < run && out.length < len; i++) out.push(value);
        if (out.length >= len) break;
    }
    return fit(out, len);
};
