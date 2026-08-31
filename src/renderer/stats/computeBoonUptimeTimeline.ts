import {
    getBuffMeta, listBoonIds, getEntityBuffStatesPerSource, squadEntities, getEntityProfession,
} from '@axiapps/bridge-metrics';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { applyLabel, type FrameFightLabels } from './slice/frameLabels';

export type UptimePlayer = {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    total: number;
    peak: number;
    /** Summed `UptimeFightValue.weightedMs` across the fights below. */
    weightedMs: number;
    /**
     * Milliseconds of fight the player was actually in the squad for, summed
     * over the session. This is the only correct denominator for an overall
     * uptime: `logs` counts only fights where the boon was present, and the
     * session's total duration punishes anyone who showed up late.
     */
    attendedMs: number;
};
type UptimeFightValue = {
    total: number;
    peak: number;
    buckets: number[];
    /**
     * Exact time-weighted coverage in milliseconds: boon-milliseconds for a
     * duration boon, stack-milliseconds for an intensity one. `buckets` is a
     * rendering grid whose last cell is short whenever the fight does not
     * divide evenly by the interval, so aggregate uptime must come from this
     * against the fight duration -- not from the bucket mean.
     */
    weightedMs: number;
};
type UptimeFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    durationMs: number;
    values: Record<string, UptimeFightValue>;
    maxTotal: number;
};
export type UptimeBucket = {
    id: string;
    name: string;
    icon?: string;
    stacking: boolean;
    intervalMs: number;
    players: Map<string, UptimePlayer>;
    fights: UptimeFight[];
};

export interface BoonUptimeTimelineAccumulator {
    boonBuckets: Map<string, UptimeBucket>;
    /**
     * Attendance is boon-independent, so it is tracked once per fight rather
     * than per boon bucket -- a player present for a fight in which they never
     * received the boon still has to land in that boon's denominator.
     */
    attendedMsByPlayer: Map<string, number>;
    defaultBoonIntervalMs: number;
    defaultStackingIntervalMs: number;
    logIndex: number;
}

const ensureBoonBucket = (
    boonBuckets: Map<string, UptimeBucket>,
    boonId: string,
    defaultBoonIntervalMs: number,
    defaultStackingIntervalMs: number,
    meta?: any
) => {
    if (!boonBuckets.has(boonId)) {
        const stacking = Boolean(meta?.stacking);
        boonBuckets.set(boonId, {
            id: boonId,
            name: String(meta?.name || boonId),
            icon: meta?.icon,
            stacking,
            intervalMs: stacking ? defaultStackingIntervalMs : defaultBoonIntervalMs,
            players: new Map<string, UptimePlayer>(),
            fights: []
        });
    } else if (meta) {
        const existing = boonBuckets.get(boonId)!;
        if ((!existing.name || existing.name === boonId) && meta?.name) existing.name = String(meta.name);
        if (!existing.icon && meta?.icon) existing.icon = String(meta.icon);
        if (!existing.stacking && Boolean(meta?.stacking)) {
            existing.stacking = true;
            existing.intervalMs = defaultStackingIntervalMs;
        }
    }
    return boonBuckets.get(boonId)!;
};
const normalizeStatePairs = (states: any): Array<[number, number]> => {
    if (!Array.isArray(states)) return [];
    return states
        .map((entry: any) => {
            if (Array.isArray(entry)) return [Number(entry[0]), Number(entry[1])] as [number, number];
            if (entry && typeof entry === 'object') return [Number(entry.time), Number(entry.value)] as [number, number];
            return null;
        })
        .filter((entry: any): entry is [number, number] =>
            !!entry
            && Number.isFinite(entry[0])
            && Number.isFinite(entry[1])
            && entry[0] >= 0
        )
        .sort((a, b) => a[0] - b[0]);
};
const resolveBoonStackCap = (boonName: string, stacking: boolean) => {
    if (!stacking) return 1;
    const normalized = String(boonName || '').trim().toLowerCase();
    if (normalized === 'might' || normalized === 'stability') return 25;
    return 25;
};
const normalizeBucketStackValue = (rawValue: number, stacking: boolean, stackCap: number) => {
    const safe = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
    if (!stacking) return safe > 0 ? 1 : 0;
    return Math.max(0, Math.min(stackCap, Math.round(safe)));
};
/**
 * Collapse the per-source state timelines into one step function of total
 * stacks over `[0, endMs)`, as half-open segments.
 *
 * The sources have to be merged before normalization, not after: a duration
 * boon held by two sources at once is still one stack of uptime, and an
 * intensity boon's stack cap applies to the sum.
 */
type StackSegment = { start: number; end: number; value: number };
const mergeStateSegments = (statesPerSource: Record<string, any>, endMs: number): StackSegment[] => {
    if (!statesPerSource || typeof statesPerSource !== 'object' || endMs <= 0) return [];
    const series = Object.values(statesPerSource)
        .map((states: any) => normalizeStatePairs(states))
        .filter((states) => states.length > 0);
    if (series.length === 0) return [];

    const boundaries = new Set<number>([0]);
    series.forEach((states) => states.forEach(([time]) => {
        if (time > 0 && time < endMs) boundaries.add(time);
    }));
    const times = Array.from(boundaries).sort((a, b) => a - b);

    const cursor = series.map(() => 0);
    const current = series.map(() => 0);
    const segments: StackSegment[] = [];
    for (let i = 0; i < times.length; i += 1) {
        const start = times[i];
        for (let s = 0; s < series.length; s += 1) {
            while (cursor[s] < series[s].length && series[s][cursor[s]][0] <= start) {
                current[s] = Math.max(0, Number(series[s][cursor[s]][1] || 0));
                cursor[s] += 1;
            }
        }
        const end = i + 1 < times.length ? times[i + 1] : endMs;
        if (end > start) {
            segments.push({ start, end, value: current.reduce((sum, value) => sum + value, 0) });
        }
    }
    return segments;
};

/**
 * Integrate the merged timeline over each bucket rather than sampling it at
 * the bucket's leading edge. The sampled reading was systematically low --
 * axilog opens every state list with `[0, 0]`, so bucket 0 always read empty
 * and no player could exceed (bucketCount - 1) / bucketCount.
 */
const sampleStackTimeline = (
    statesPerSource: Record<string, any>,
    bucketCount: number,
    stacking: boolean,
    boonName: string,
    intervalMs: number,
    durationMs: number
) => {
    const buckets = Array.from({ length: bucketCount }, () => 0);
    if (bucketCount <= 0) return { buckets, weightedMs: 0 };
    const endMs = Math.max(0, durationMs);
    const segments = mergeStateSegments(statesPerSource, endMs);
    if (segments.length === 0) return { buckets, weightedMs: 0 };

    const stackCap = resolveBoonStackCap(boonName, stacking);
    let weightedMs = 0;
    segments.forEach(({ start, end, value }) => {
        const normalized = normalizeBucketStackValue(value, stacking, stackCap);
        if (normalized <= 0) return;
        weightedMs += (end - start) * normalized;
        const firstBucket = Math.min(bucketCount - 1, Math.floor(start / intervalMs));
        for (let bucketIndex = firstBucket; bucketIndex < bucketCount; bucketIndex += 1) {
            const bucketStart = bucketIndex * intervalMs;
            if (bucketStart >= end) break;
            const overlap = Math.min(end, bucketStart + intervalMs) - Math.max(start, bucketStart);
            if (overlap > 0) buckets[bucketIndex] += overlap * normalized;
        }
    });

    // Each bucket is expressed as a share of its own span so the heatmap reads
    // 0..1 (or 0..cap); the final bucket is short on a fight that does not
    // divide evenly, and dividing by the full interval would flatten it.
    return {
        buckets: buckets.map((value, index) => {
            const span = Math.min(intervalMs, endMs - index * intervalMs);
            return span > 0 ? roundBucket(value / span) : 0;
        }),
        weightedMs,
    };
};

/** Buckets are now fractional; three decimals is well under a rendered pixel. */
const roundBucket = (value: number) => Math.round(value * 1000) / 1000;
const createFightValue = (buckets: number[], weightedMs: number): UptimeFightValue => {
    const total = buckets.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
    const peak = buckets.reduce((best, value) => Math.max(best, Math.max(0, Number(value || 0))), 0);
    return { total, peak, buckets, weightedMs: Math.max(0, Number(weightedMs || 0)) };
};

export function createBoonUptimeTimelineAccumulator(
    settings?: { boonBucketIntervalMs: number; stackingBoonBucketIntervalMs: number }
): BoonUptimeTimelineAccumulator {
    return {
        boonBuckets: new Map<string, UptimeBucket>(),
        attendedMsByPlayer: new Map<string, number>(),
        defaultBoonIntervalMs: settings?.boonBucketIntervalMs ?? 5000,
        defaultStackingIntervalMs: settings?.stackingBoonBucketIntervalMs ?? 5000,
        logIndex: 0
    };
}

export function ingestLogBoonUptimeTimeline(log: any, acc: BoonUptimeTimelineAccumulator): void {
    const index = acc.logIndex;
    acc.logIndex += 1;
    const { boonBuckets, defaultBoonIntervalMs, defaultStackingIntervalMs } = acc;

    const details = log?.details;
    if (!details) return;
    const members = squadEntities(details?.native);
    if (members.length <= 0) return;
    const durationMs = Math.max(0, Number(details?.native?.encounter?.duration_ms ?? details?.durationMS ?? 0));
    const fullLabel = buildFightLabelV2({
        zone: details.fightName || log.fightName || `Fight ${index + 1}`,
        durationMs: details.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
    const fightValuesByBoon = new Map<string, Map<string, UptimeFightValue>>();
    const fightPlayerSeenByBoon = new Map<string, Set<string>>();

    const attendedThisFight = new Set<string>();

    members.forEach((entity) => {
        const account = String(entity.account || entity.character || 'Unknown');
        const key = account;
        const profession = getEntityProfession(entity) || 'Unknown';

        // Once per player per fight: axilog emits one entity per agent
        // instance, so a player who reconnected appears twice in `members`.
        if (!attendedThisFight.has(key)) {
            attendedThisFight.add(key);
            acc.attendedMsByPlayer.set(key, (acc.attendedMsByPlayer.get(key) || 0) + durationMs);
        }

        listBoonIds(details).forEach((boonIdNum) => {
            const meta = getBuffMeta(details, boonIdNum);
            if (!meta) return;
            const boonId = `b${boonIdNum}`;

            // Native keys per-source states by entity id. EI keyed them by
            // character name, which is not unique -- axilog emits one entity
            // per agent instance, so two entries can share a name.
            const bySource = getEntityBuffStatesPerSource(details, entity.id, boonIdNum);
            if (bySource.size === 0) return;
            const statesPerSource: Record<string, Array<[number, number]>> = {};
            for (const [sourceId, states] of bySource) statesPerSource[String(sourceId)] = states;

            const boonBucket = ensureBoonBucket(
                boonBuckets, boonId, defaultBoonIntervalMs, defaultStackingIntervalMs,
                { name: meta.name, stacking: meta.stacking },
            );
            const intervalMs = boonBucket.intervalMs;
            const boonBucketCount = Math.max(1, Math.ceil(Math.max(1, durationMs) / intervalMs));
            const { buckets, weightedMs } = sampleStackTimeline(
                statesPerSource, boonBucketCount, meta.stacking, meta.name, intervalMs, durationMs,
            );
            const fightValue = createFightValue(buckets, weightedMs);
            if (fightValue.total <= 0 && fightValue.peak <= 0) return;

            const playerEntry = boonBucket.players.get(key) || {
                key,
                account,
                displayName: account,
                profession,
                professionList: profession && profession !== 'Unknown' ? [profession] : [],
                logs: 0,
                total: 0,
                peak: 0,
                weightedMs: 0,
                attendedMs: 0
            };
            if (profession && profession !== 'Unknown' && !playerEntry.professionList.includes(profession)) {
                playerEntry.professionList.push(profession);
            }
            if ((!playerEntry.profession || playerEntry.profession === 'Unknown') && profession && profession !== 'Unknown') {
                playerEntry.profession = profession;
            }
            const seen = fightPlayerSeenByBoon.get(boonId) || new Set<string>();
            if (!seen.has(key)) {
                seen.add(key);
                playerEntry.logs += 1;
                fightPlayerSeenByBoon.set(boonId, seen);
            }
            playerEntry.total += fightValue.total;
            playerEntry.weightedMs += fightValue.weightedMs;
            playerEntry.peak = Math.max(playerEntry.peak, fightValue.peak);
            boonBucket.players.set(key, playerEntry);
            const fightValues = fightValuesByBoon.get(boonId) || new Map<string, UptimeFightValue>();
            fightValues.set(key, fightValue);
            fightValuesByBoon.set(boonId, fightValues);
        });
    });

    fightValuesByBoon.forEach((playerValues, boonId) => {
        const boonBucket = boonBuckets.get(boonId);
        if (!boonBucket) return;
        const values: Record<string, UptimeFightValue> = {};
        let maxTotal = 0;
        playerValues.forEach((fightValue, playerKey) => {
            values[playerKey] = {
                total: Number(fightValue.total || 0),
                peak: Number(fightValue.peak || 0),
                weightedMs: Number(fightValue.weightedMs || 0),
                buckets: Array.isArray(fightValue.buckets)
                    ? fightValue.buckets.map((entry: any) => Number(entry || 0))
                    : []
            };
            maxTotal = Math.max(maxTotal, Number(fightValue.peak || 0));
        });
        if (Object.keys(values).length === 0) return;
        boonBucket.fights.push({
            id: log.filePath || log.id || `fight-${index + 1}`,
            shortLabel: `F${index + 1}`,
            fullLabel,
            timestamp: resolveFightTimestamp(details, log),
            durationMs,
            values,
            maxTotal
        });
    });
}

export function finalizeBoonUptimeTimeline(acc: BoonUptimeTimelineAccumulator): any {
    return Array.from(acc.boonBuckets.values())
        .map((bucket) => ({
            id: bucket.id,
            name: bucket.name || bucket.id,
            icon: bucket.icon,
            stacking: bucket.stacking,
            intervalMs: bucket.intervalMs,
            players: Array.from(bucket.players.values())
                .map((player) => ({
                    ...player,
                    attendedMs: acc.attendedMsByPlayer.get(player.key) || 0,
                }))
                .sort((a, b) => {
                const peakDiff = Number(b.peak || 0) - Number(a.peak || 0);
                if (peakDiff !== 0) return peakDiff;
                const totalDiff = Number(b.total || 0) - Number(a.total || 0);
                if (totalDiff !== 0) return totalDiff;
                return String(a.displayName || '').localeCompare(String(b.displayName || ''));
            }),
            fights: [...bucket.fights]
                .sort((a, b) => {
                    if (a.timestamp > 0 && b.timestamp > 0 && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
                    return a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true });
                })
                .map((fight, i) => ({ ...fight, shortLabel: `F${i + 1}` }))
        }))
        .filter((boon) => boon.players.length > 0 && boon.fights.length > 0)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function computeBoonUptimeTimeline(
    validLogs: any[],
    settings?: { boonBucketIntervalMs: number; stackingBoonBucketIntervalMs: number }
) {
    const acc = createBoonUptimeTimelineAccumulator(settings);

    const sorted = validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .map(({ log }) => log);

    for (const log of sorted) {
        ingestLogBoonUptimeTimeline(log, acc);
    }

    return finalizeBoonUptimeTimeline(acc);
}

export interface BoonUptimeFrame {
    boonBuckets: Map<string, UptimeBucket>;
    attendedMsByPlayer: Map<string, number>;
}

export function extractBoonUptimeFrame(acc: BoonUptimeTimelineAccumulator): BoonUptimeFrame {
    if (acc.logIndex !== 1) {
        throw new Error(`extractBoonUptimeFrame expects exactly one log, got ${acc.logIndex}`);
    }
    return { boonBuckets: acc.boonBuckets, attendedMsByPlayer: acc.attendedMsByPlayer };
}

/**
 * Merge one fight's uptime buckets into a running accumulator.
 *
 * `total` and `logs` are sums; `peak` is a max, mirroring the ingest fold.
 * `intervalMs` comes from settings rather than from the log, so the target's
 * value always wins — a frame built under different settings is rejected far
 * earlier, by the sidecar's settingsHash check.
 */

/**
 * `labels` re-states the ordinal-derived strings at the merge ordinal. Every
 * boon bucket repeats the same per-fight row, so the rewrite walks all of them.
 */
export function mergeBoonUptimeFrame(target: BoonUptimeTimelineAccumulator, frame: BoonUptimeFrame, labels: FrameFightLabels): void {
    frame.boonBuckets.forEach((sourceBucket) => {
        sourceBucket.fights.forEach((fight: any) => {
            applyLabel(fight, 'id', labels.fightId);
            applyLabel(fight, 'shortLabel', labels.shortLabel);
            applyLabel(fight, 'fullLabel', labels.fullLabel);
        });
    });
    target.logIndex += 1;
    frame.attendedMsByPlayer.forEach((attendedMs, key) => {
        target.attendedMsByPlayer.set(key, (target.attendedMsByPlayer.get(key) || 0) + attendedMs);
    });
    frame.boonBuckets.forEach((sourceBucket, boonId) => {
        let bucket = target.boonBuckets.get(boonId);
        if (!bucket) {
            bucket = {
                id: sourceBucket.id,
                name: sourceBucket.name,
                icon: sourceBucket.icon,
                stacking: sourceBucket.stacking,
                intervalMs: sourceBucket.stacking
                    ? target.defaultStackingIntervalMs
                    : target.defaultBoonIntervalMs,
                players: new Map<string, UptimePlayer>(),
                fights: [],
            };
            target.boonBuckets.set(boonId, bucket);
        } else {
            if ((!bucket.name || bucket.name === boonId) && sourceBucket.name) bucket.name = sourceBucket.name;
            if (!bucket.icon && sourceBucket.icon) bucket.icon = sourceBucket.icon;
        }
        sourceBucket.fights.forEach((fight) => bucket!.fights.push(fight));
        sourceBucket.players.forEach((sourcePlayer, key) => {
            const existing = bucket!.players.get(key);
            if (!existing) {
                bucket!.players.set(key, {
                    ...sourcePlayer,
                    professionList: [...sourcePlayer.professionList],
                });
                return;
            }
            existing.logs += sourcePlayer.logs;
            existing.total += sourcePlayer.total;
            existing.weightedMs += sourcePlayer.weightedMs;
            existing.peak = Math.max(existing.peak, sourcePlayer.peak);
            sourcePlayer.professionList.forEach((profession) => {
                if (!existing.professionList.includes(profession)) existing.professionList.push(profession);
            });
            if ((!existing.profession || existing.profession === 'Unknown')
                && sourcePlayer.profession && sourcePlayer.profession !== 'Unknown') {
                existing.profession = sourcePlayer.profession;
            }
        });
    });
}
