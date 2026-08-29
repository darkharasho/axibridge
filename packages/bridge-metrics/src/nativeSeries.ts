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

/**
 * `decodeSeries`'s counterpart for NON-cumulative series — per-bucket counts
 * such as `cc_applied`, `downs` and `strips`.
 *
 * The difference is the padding rule and it is not cosmetic. `decodeSeries`
 * pads a short run by REPEATING the last value, which is correct for a
 * cumulative series and catastrophic for a count series: a fight whose last
 * encoded run is `[3, 1]` would report 3 CC applications in every remaining
 * second of the fight. Counts pad with zero.
 */
export const decodeCountSeries = (series: NativeSeries | null | undefined): number[] => {
    if (!series || !Array.isArray(series.data)) return [];
    const len = Number(series.len);
    if (!Number.isFinite(len) || len <= 0) return [];
    if (series.interval_ms !== SERIES_INTERVAL_MS) {
        throw new Error(
            `decodeCountSeries: expected interval_ms ${SERIES_INTERVAL_MS}, got ${series.interval_ms}`
        );
    }

    const out: number[] = [];
    if (series.enc === 'raw') {
        for (const v of series.data as number[]) {
            if (out.length >= len) break;
            out.push(Number(v) || 0);
        }
    } else if (series.enc === 'rle') {
        for (const pair of series.data as Array<[number, number]>) {
            if (!Array.isArray(pair)) continue;
            const value = Number(pair[0]) || 0;
            const run = Number(pair[1]) || 0;
            for (let i = 0; i < run && out.length < len; i++) out.push(value);
            if (out.length >= len) break;
        }
    } else {
        return [];
    }
    while (out.length < len) out.push(0);
    return out;
};

export type SquadSeriesLane = 'damage' | 'cc_applied' | 'downs' | 'strips';
/**
 * `cc_taken` arrived in axilog 1.9.0, later than the other three, so a
 * report parsed by 1.8.x carries every other lane and not this one. Callers
 * must therefore check this lane's own presence rather than inferring it
 * from a sibling — see `ControlFightData.ccInRecorded`.
 */
export type EntitySeriesLane = 'cc_applied' | 'strips' | 'strips_taken' | 'cc_taken';

/**
 * Read a squad-level lane out of a native report.
 *
 * Returns `null` when the lane was not recorded — a report parsed by an
 * axilog older than 1.8.0, or no native report at all — and an array
 * otherwise. `null` and `[]` mean different things and callers must keep
 * them apart: an all-zero grid drawn from `null` is a lie.
 */
export const readSquadSeries = (native: any, lane: SquadSeriesLane): number[] | null => {
    const series = native?.blocks?.series?.squad?.[lane];
    if (!series) return null;
    return decodeCountSeries(series as NativeSeries);
};

/**
 * Read a per-entity lane. These are gated on axilog's `timeseries` option
 * (bound to the `rawTimelineArrays` setting), so `null` additionally means
 * "the user has raw timeline arrays switched off".
 */
export const readEntitySeries = (
    native: any,
    entityId: string,
    lane: EntitySeriesLane,
): number[] | null => {
    const series = native?.blocks?.series?.by_entity?.[entityId]?.[lane];
    if (!series) return null;
    return decodeCountSeries(series as NativeSeries);
};
