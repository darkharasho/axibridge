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
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';

export const CONTROL_BUCKET_MS = 5000;
const NATIVE_INTERVAL_MS = 1000;
const PER_BUCKET = CONTROL_BUCKET_MS / NATIVE_INTERVAL_MS;

export type ControlLane = 'cc' | 'stripsOut' | 'stripsIn' | 'ccIn';

export type ControlPlayerData = {
    group: number;
    displayName: string;
    /**
     * EI's profession string, carried so the grid can show a class icon
     * beside each name. Icons resolve to bundled base64 data URIs at build
     * time (`classIconUtils`), so this adds one short string per player per
     * fight to `report.json` and no image payload at all.
     */
    profession: string;
    cc: number[];
    stripsOut: number[];
    stripsIn: number[];
    /**
     * Incoming CC — the per-second decomposition of
     * `blocks.defenses.by_entity[].received_cc_count`, added in axilog 1.9.0.
     *
     * Deliberately not comparable to `cc` summed the other way round: GW2EI
     * counts incoming CC with no source filter and no pet/minion fold, so a
     * squad's `ccIn` total exceeds its `cc` total by everything the enemy
     * applied and by every minion hit. Reading one as the mirror of the other
     * is wrong at the source, not here.
     */
    ccIn: number[];
};

export type ControlFightData = {
    id: string;
    /**
     * Human fight label — `"Eternal: Bay (2:31)"` — built by the same
     * `buildFightLabelV2` every other fight picker in the app uses. Built
     * here rather than in the section because the web report has no log
     * details at render time, so the zone and average position it derives
     * from are gone by then. Absent on a `report.json` written before this
     * field existed; the picker falls back to the log filename there.
     */
    label: string;
    bucketCount: number;
    durationMs: number;
    players: Record<string, ControlPlayerData>;
    /**
     * Per-fight sibling of the accumulator-level `recorded`. The top-level
     * flag latches true dataset-wide the moment ANY ingested log carries
     * lanes, which is too coarse for the sections: they render one fight at
     * a time, so a fight from a log parsed before axilog 1.8.0 (or with
     * rawTimelineArrays off) would otherwise draw as an all-zero grid
     * indistinguishable from a genuinely quiet fight. This is set from that
     * log's own lane check.
     */
    recorded: boolean;
    /**
     * `recorded`, but for `ccIn` alone. The `cc_taken` lane landed in axilog
     * 1.9.0, one release after the other three, so a fight parsed by 1.8.x
     * sets `recorded` true off its strips lanes while carrying no incoming CC
     * at all. Folding this into the shared flag would draw that fight's CC
     * overlay as an all-zero band reading "nobody was CC'd" — the exact lie
     * the flag exists to prevent. Absent on a `report.json` written before
     * this field existed, which is falsy, which is the honest answer.
     */
    ccInRecorded: boolean;
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

/**
 * Sum PER_BUCKET consecutive 1s values into each 5s bucket.
 *
 * Clamps overflow into the last bucket (matching `sumTo5sBuckets` in
 * `computeStabPerformance.ts`) rather than dropping it, so a native series
 * slightly longer than `ceil(durationMs/5000)*5` seconds (e.g. an
 * inclusive-endpoint `len`) still sums to the player's whole-fight total, as
 * `metrics-spec.md` promises.
 */
const downsample = (native: number[] | null, bucketCount: number): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    if (!native) return out;
    for (let i = 0; i < native.length; i++) {
        const b = Math.min(bucketCount - 1, Math.floor(i / PER_BUCKET));
        out[b] += Number(native[i]) || 0;
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
    const label = buildFightLabelV2({
        zone: details.fightName || log?.fightName || `Fight ${acc.fights.length + 1}`,
        durationMs,
        avgPosition: computeFightAvgPosition(details),
    });

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
    let sawCcIn = false;

    squadPlayers.forEach((player: any) => {
        const account = String(player?.account || player?.name || 'Unknown');
        const entityId = entityByAccount.get(account);
        const key = entityId === undefined ? null : String(entityId);

        const cc = key === null ? null : readEntitySeries(native, key, 'cc_applied');
        const stripsOut = key === null ? null : readEntitySeries(native, key, 'strips');
        const stripsIn = key === null ? null : readEntitySeries(native, key, 'strips_taken');
        const ccIn = key === null ? null : readEntitySeries(native, key, 'cc_taken');
        if (cc?.length || stripsOut?.length || stripsIn?.length) sawLane = true;
        if (ccIn?.length) sawCcIn = true;

        const ccBuckets = downsample(cc, bucketCount);
        const stripsOutBuckets = downsample(stripsOut, bucketCount);
        const stripsInBuckets = downsample(stripsIn, bucketCount);
        const ccInBuckets = downsample(ccIn, bucketCount);

        // Consumers (CcTimelineSection, StripTimelineSection) iterate
        // `Object.entries(fight.players)` and already tolerate a missing key
        // — omitting an all-zero player here drops roughly a sixth of the
        // rows on a real roster (measured on the native fixtures), and
        // `report.json`'s trim pass has no way to shrink a dense-zeros
        // section after the fact.
        const hasAnyValue = (arr: number[]) => arr.some((v) => v !== 0);
        if (!hasAnyValue(ccBuckets) && !hasAnyValue(stripsOutBuckets)
            && !hasAnyValue(stripsInBuckets) && !hasAnyValue(ccInBuckets)) {
            return;
        }

        playersOut[account] = {
            group: Number(player?.group || 0),
            displayName: String(player?.name || account),
            profession: String(player?.profession || ''),
            cc: ccBuckets,
            stripsOut: stripsOutBuckets,
            stripsIn: stripsInBuckets,
            ccIn: ccInBuckets,
        };
    });

    if (sawLane) acc.recorded = true;
    acc.fights.push({
        id: fightId, label, bucketCount, durationMs, players: playersOut,
        recorded: sawLane, ccInRecorded: sawCcIn,
    });
}

export function extractControlTimelineFrame(acc: ControlTimelineAccumulator): ControlTimelineFrame {
    if (acc.fights.length > 1) {
        throw new Error(`extractControlTimelineFrame expects at most one fight, got ${acc.fights.length}`);
    }
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

export type IncomingLaneScope = 'player' | 'squad';

export type IncomingLaneResult = {
    /** One entry per target bucket. All zeros when nothing was captured. */
    buckets: number[];
    /** 0..1 per bucket, normalized against this fight's own peak. */
    intensity: number[];
    /** False means the series was never captured — say so, don't draw zeros. */
    recorded: boolean;
    /**
     * `player` when `playerKey` names a real squad member in this fight;
     * `squad` when it does not. The boon charts address rows by keys the
     * control accumulator never sees — `__all__` and `__subgroup__:N` — and
     * a per-player lookup for those silently yields an all-zero band that
     * reads as "nothing happened to anyone". Summing the squad is the honest
     * answer for an aggregate row, and the caller labels the band from this.
     */
    scope: IncomingLaneScope;
};

/** The incoming lanes a boon drilldown can shade its buckets by. */
type IncomingLaneKey = 'stripsIn' | 'ccIn';

/**
 * An incoming lane for a player (or the whole squad), re-bucketed from this
 * module's 5s grid onto whatever interval the caller's chart uses.
 *
 * The boon uptime drilldown's bucket interval is user-configurable down to
 * 1s, finer than CONTROL_BUCKET_MS. Rather than fabricate a distribution
 * inside a 5s bucket we don't have, each target bucket repeats the 5s value
 * covering it — so the band's *shape* is right at 5s resolution and its
 * numbers stay whole counts. Callers label the tooltip "(5s)" to say so.
 * Rebuilding this at 1s would mean storing the native series at 1s in
 * `report.json`, five times the numbers in a payload that is already trimmed.
 */
function resolveIncomingLane(
    fight: ControlFightData | null | undefined,
    lane: IncomingLaneKey,
    recorded: boolean,
    playerKey: string | null | undefined,
    targetIntervalMs: number,
    targetCount: number,
): IncomingLaneResult {
    const count = Math.max(0, Math.floor(targetCount));
    const empty = Array.from({ length: count }, () => 0);
    if (!fight || !recorded) {
        return { buckets: empty, intensity: empty.slice(), recorded: false, scope: 'squad' };
    }

    const entry = playerKey ? fight.players?.[playerKey] : undefined;
    const scope: IncomingLaneScope = entry ? 'player' : 'squad';
    let source: number[];
    if (entry) {
        source = Array.isArray(entry[lane]) ? entry[lane] : [];
    } else {
        source = Array.from({ length: fight.bucketCount }, () => 0);
        Object.values(fight.players || {}).forEach((player) => {
            (player?.[lane] || []).forEach((value, index) => {
                source[index] = Number(source[index] || 0) + Number(value || 0);
            });
        });
    }

    const interval = Math.max(1, Number(targetIntervalMs) || CONTROL_BUCKET_MS);
    const buckets = Array.from({ length: count }, (_, index) => {
        const sourceIndex = Math.floor((index * interval) / CONTROL_BUCKET_MS);
        return Number(source[sourceIndex] || 0);
    });
    const max = buckets.reduce((best, value) => Math.max(best, value), 0);
    const intensity = buckets.map((value) => (max > 0 ? Math.max(0, Math.min(1, value / max)) : 0));
    return { buckets, intensity, recorded: true, scope };
}

/** Boons stripped off a player (or the whole squad). See `resolveIncomingLane`. */
export function resolveIncomingStrips(
    fight: ControlFightData | null | undefined,
    playerKey: string | null | undefined,
    targetIntervalMs: number,
    targetCount: number,
): IncomingLaneResult {
    return resolveIncomingLane(
        fight, 'stripsIn', Boolean(fight?.recorded), playerKey, targetIntervalMs, targetCount,
    );
}

/**
 * CC landed on a player (or the whole squad). See `resolveIncomingLane`.
 *
 * Gated on `ccInRecorded`, not `recorded`: `cc_taken` shipped in axilog
 * 1.9.0, a release after the strips lanes, so a fight can be `recorded` and
 * still carry no incoming CC.
 */
export function resolveIncomingCc(
    fight: ControlFightData | null | undefined,
    playerKey: string | null | undefined,
    targetIntervalMs: number,
    targetCount: number,
): IncomingLaneResult {
    return resolveIncomingLane(
        fight, 'ccIn', Boolean(fight?.ccInRecorded), playerKey, targetIntervalMs, targetCount,
    );
}
