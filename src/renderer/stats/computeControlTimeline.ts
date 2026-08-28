/**
 * Per-fight precomputed drilldown data for the CC Timeline and Strip
 * Timeline sections.
 *
 * Captures, per 5s bucket and per squad player: outgoing CC applied,
 * outgoing boon strips, and boons stripped off that player. Like
 * `computeStabPerformance`, this must run during aggregation so the web
 * report — which has no log details at render time — can still draw it.
 *
 * The native series are 1s; they are summed down to 5s here so the grid
 * lands on the same buckets as `StabPerfFightData`, which the Stab
 * Performance strips-taken overlay depends on.
 */

import { readEntitySeries } from '@axiapps/bridge-metrics';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

export const CONTROL_BUCKET_MS = 5000;
const NATIVE_INTERVAL_MS = 1000;
const PER_BUCKET = CONTROL_BUCKET_MS / NATIVE_INTERVAL_MS;

export type ControlLane = 'cc' | 'stripsOut' | 'stripsIn';

export type ControlPlayerData = {
    group: number;
    displayName: string;
    cc: number[];
    stripsOut: number[];
    stripsIn: number[];
};

export type ControlFightData = {
    id: string;
    bucketCount: number;
    durationMs: number;
    players: Record<string, ControlPlayerData>;
};

export type ControlTimelineAccumulator = {
    fights: ControlFightData[];
    /**
     * False until at least one ingested log carried per-entity lanes. The UI
     * uses this to tell "raw timeline arrays are off / this log predates
     * axilog 1.8.0" apart from "nobody stripped anything", which would
     * otherwise render identically.
     */
    recorded: boolean;
};

export type ControlTimelineFrame = ControlTimelineAccumulator;

export function createControlTimelineAccumulator(): ControlTimelineAccumulator {
    return { fights: [], recorded: false };
}

/** Sum PER_BUCKET consecutive 1s values into each 5s bucket. */
const downsample = (native: number[] | null, bucketCount: number): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    if (!native) return out;
    for (let i = 0; i < native.length; i++) {
        const b = Math.floor(i / PER_BUCKET);
        if (b < bucketCount) out[b] += Number(native[i]) || 0;
    }
    return out;
};

export function ingestLogControlTimeline(log: any, acc: ControlTimelineAccumulator): void {
    const details = log?.details;
    if (!details) return;
    const players = Array.isArray(details.players) ? details.players : [];
    const squadPlayers = players.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return;
    const fightId = String(log?.filePath || log?.id || '');
    if (!fightId) return;
    const durationMs = Math.max(0, Number(details?.durationMS || 0));
    if (durationMs <= 0) return;
    const bucketCount = Math.max(1, Math.ceil(durationMs / CONTROL_BUCKET_MS));

    const native = details?.native ?? {};
    // Series are keyed by native entity id; the EI player rows are keyed by
    // account. Account is the only key both surfaces share — the same join
    // `computeStabPerformance` makes for its distance scalars.
    const entityByAccount = new Map<string, number>();
    for (const e of squadEntities(native)) {
        if (e.account) entityByAccount.set(e.account, e.id);
    }

    const playersOut: Record<string, ControlPlayerData> = {};
    let sawLane = false;

    squadPlayers.forEach((player: any) => {
        const account = String(player?.account || player?.name || 'Unknown');
        const entityId = entityByAccount.get(account);
        const key = entityId === undefined ? null : String(entityId);

        const cc = key === null ? null : readEntitySeries(native, key, 'cc_applied');
        const stripsOut = key === null ? null : readEntitySeries(native, key, 'strips');
        const stripsIn = key === null ? null : readEntitySeries(native, key, 'strips_taken');
        if (cc || stripsOut || stripsIn) sawLane = true;

        playersOut[account] = {
            group: Number(player?.group || 0),
            displayName: String(player?.name || account),
            cc: downsample(cc, bucketCount),
            stripsOut: downsample(stripsOut, bucketCount),
            stripsIn: downsample(stripsIn, bucketCount),
        };
    });

    if (sawLane) acc.recorded = true;
    acc.fights.push({ id: fightId, bucketCount, durationMs, players: playersOut });
}

export function extractControlTimelineFrame(acc: ControlTimelineAccumulator): ControlTimelineFrame {
    return { fights: acc.fights, recorded: acc.recorded };
}

export function mergeControlTimelineFrame(
    target: ControlTimelineAccumulator,
    frame: ControlTimelineFrame,
): void {
    if (!frame) return;
    target.fights.push(...(frame.fights || []));
    if (frame.recorded) target.recorded = true;
}

export function finalizeControlTimeline(
    acc: ControlTimelineAccumulator,
): { fights: ControlFightData[]; recorded: boolean } {
    return { fights: acc.fights, recorded: acc.recorded };
}
