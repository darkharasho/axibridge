import {
    getBuffMeta, listBoonIds, squadEntities, getEntityProfession, getEntityBuffStatesPerSource,
} from '@axiapps/bridge-metrics';
import { getEntityBoonGenerationMs } from '../../shared/boonGeneration';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { applyLabel, type FrameFightLabels } from './slice/frameLabels';

export type BoonPlayer = {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    totals: {
        selfBuffs: number;
        groupBuffs: number;
        squadBuffs: number;
        totalBuffs: number;
    };
};
type BoonFightValue = {
    total: number;
    totals: {
        selfBuffs: number;
        groupBuffs: number;
        squadBuffs: number;
        totalBuffs: number;
    };
    bucketWeights5s: number[];
    buckets5s: number[];
};
/**
 * One raw `addBoonCategoryGeneration` call captured in the exact order it was
 * applied to `boonBuckets.players` during ingest. `category` is an index into
 * `['selfBuffs', 'groupBuffs', 'squadBuffs']` — kept numeric to stay small.
 *
 * A frame is always exactly one log (see `extractBoonTimelineFrame`), so this
 * is one fight's complete, ordered event stream. It exists purely so a slice
 * merge can replay it — see `mergeBoonTimelineFrame` — and is stripped back
 * out in `finalizeBoonTimeline` so it never reaches the published `stats`
 * output for non-slice builds.
 */
type BoonRawEvent = { key: string; category: 0 | 1 | 2; value: number };
type BoonFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    durationMs: number;
    values: Record<string, BoonFightValue>;
    maxTotal: number;
    events: BoonRawEvent[];
};
export type BoonBucket = {
    id: string;
    name: string;
    icon?: string;
    stacking: boolean;
    players: Map<string, BoonPlayer>;
    fights: BoonFight[];
};

export interface BoonTimelineAccumulator {
    boonBuckets: Map<string, BoonBucket>;
    logIndex: number;
}

const ensureBoonBucket = (boonBuckets: Map<string, BoonBucket>, boonId: string, meta?: any) => {
    if (!boonBuckets.has(boonId)) {
        boonBuckets.set(boonId, {
            id: boonId,
            name: String(meta?.name || boonId),
            icon: meta?.icon,
            stacking: Boolean(meta?.stacking),
            players: new Map<string, BoonPlayer>(),
            fights: []
        });
    } else if (meta) {
        const existing = boonBuckets.get(boonId)!;
        if ((!existing.name || existing.name === boonId) && meta?.name) existing.name = String(meta.name);
        if (!existing.icon && meta?.icon) existing.icon = String(meta.icon);
        if (!existing.stacking && Boolean(meta?.stacking)) existing.stacking = true;
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
const ensureBucketArray = (map: Map<string, number[]>, key: string, bucketCount: number) => {
    const current = map.get(key) || [];
    if (current.length < bucketCount) current.length = bucketCount;
    for (let i = 0; i < bucketCount; i += 1) {
        if (!Number.isFinite(current[i])) current[i] = 0;
    }
    map.set(key, current);
    return current;
};
const addBucketWeightsFromStates = (
    bucketMap: Map<string, number[]>,
    sourceKey: string,
    states: any,
    bucketCount: number,
    durationMs: number
) => {
    if (!sourceKey || sourceKey === '__all__' || bucketCount <= 0) return;
    const normalized = normalizeStatePairs(states);
    if (normalized.length === 0) return;
    const buckets = ensureBucketArray(bucketMap, sourceKey, bucketCount);
    const resolvedDurationMs = Math.max(1, Number(durationMs || 0), bucketCount * 5000);
    const clampTime = (value: number) => Math.max(0, Math.min(resolvedDurationMs, Number(value || 0)));
    const addSegment = (startMs: number, endMs: number, value: number) => {
        if (!Number.isFinite(value) || value <= 0) return;
        let start = clampTime(startMs);
        const end = clampTime(endMs);
        if (end <= start) return;
        while (start < end) {
            const bucketIndex = Math.max(0, Math.min(bucketCount - 1, Math.floor(start / 5000)));
            const bucketEnd = Math.min(end, (bucketIndex + 1) * 5000);
            const segmentMs = Math.max(0, bucketEnd - start);
            if (segmentMs > 0) {
                buckets[bucketIndex] = Number(buckets[bucketIndex] || 0) + (segmentMs * value);
            }
            start = bucketEnd;
        }
    };
    let prevTime = clampTime(normalized[0][0]);
    let prevValue = Math.max(0, Number(normalized[0][1] || 0));
    for (let idx = 1; idx < normalized.length; idx += 1) {
        const [timeMs, rawValue] = normalized[idx];
        const currentTime = clampTime(timeMs);
        addSegment(prevTime, currentTime, prevValue);
        prevTime = currentTime;
        prevValue = Math.max(0, Number(rawValue || 0));
    }
    addSegment(prevTime, resolvedDurationMs, prevValue);
};
const scaleBucketsToTotal = (rawBuckets: number[], total: number, bucketCount: number) => {
    const normalized = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets?.[idx] || 0));
    const rawSum = normalized.reduce((sum, value) => sum + Number(value || 0), 0);
    if (!Number.isFinite(total) || total <= 0) return normalized.map(() => 0);
    if (!Number.isFinite(rawSum) || rawSum <= 0) {
        const uniform = total / Math.max(1, bucketCount);
        return normalized.map(() => uniform);
    }
    const factor = total / rawSum;
    return normalized.map((value) => Number(value || 0) * factor);
};
const createBoonCategoryTotals = () => ({
    selfBuffs: 0,
    groupBuffs: 0,
    squadBuffs: 0,
    totalBuffs: 0
});
const addBoonCategoryGeneration = (
    target: { selfBuffs: number; groupBuffs: number; squadBuffs: number; totalBuffs: number },
    category: 'selfBuffs' | 'groupBuffs' | 'squadBuffs',
    valueMs: number
) => {
    const amount = Math.max(0, Number(valueMs || 0));
    if (!amount) return;
    target[category] = Number(target[category] || 0) + amount;
    if (category === 'selfBuffs' || category === 'squadBuffs') {
        target.totalBuffs = Number(target.totalBuffs || 0) + amount;
    }
};

export function createBoonTimelineAccumulator(): BoonTimelineAccumulator {
    return {
        boonBuckets: new Map<string, BoonBucket>(),
        logIndex: 0
    };
}

export function ingestLogBoonTimeline(log: any, acc: BoonTimelineAccumulator, _buffMap?: any): void {
    const index = acc.logIndex;
    acc.logIndex += 1;
    const { boonBuckets } = acc;

    const details = log?.details;
    if (!details) return;
    const members = squadEntities(details?.native);
    const squadCount = members.length;
    if (squadCount <= 0) return;
    const durationMs = Math.max(0, Number(details?.native?.encounter?.duration_ms ?? details?.durationMS ?? 0));
    const bucketCount = Math.max(1, Math.ceil(Math.max(1, durationMs) / 5000));
    const idToKey = new Map<number, string>();
    const groupCounts = new Map<number, number>();
    members.forEach((entity: any) => {
        const group = entity.subgroup ?? 0;
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        const key = entity.account || entity.character || 'Unknown';
        idToKey.set(entity.id, key);
    });
    const fullLabel = buildFightLabelV2({
        zone: details.fightName || log.fightName || `Fight ${index + 1}`,
        durationMs: details.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
    const fightValuesByBoon = new Map<string, Map<string, { selfBuffs: number; groupBuffs: number; squadBuffs: number; totalBuffs: number }>>();
    const fightBucketTimelineByBoon = new Map<string, Map<string, number[]>>();
    const fightPlayerSeenByBoon = new Map<string, Set<string>>();
    const fightRawEventsByBoon = new Map<string, BoonRawEvent[]>();
    const categories: Array<'selfBuffs' | 'groupBuffs' | 'squadBuffs'> = ['selfBuffs', 'groupBuffs', 'squadBuffs'];

    members.forEach((entity: any) => {
        const key = entity.account || entity.character || 'Unknown';
        const account = key;
        const profession = getEntityProfession(entity) || 'Unknown';
        const group = entity.subgroup ?? 0;
        const groupCount = Math.max(1, Number(groupCounts.get(group) || 1));

        listBoonIds(details).forEach((boonIdNum) => {
            const meta = getBuffMeta(details, boonIdNum);
            if (!meta) return;
            const boonId = `b${boonIdNum}`;
            let generatedAny = false;

            categories.forEach((category) => {
                const generationMs = Number(
                    getEntityBoonGenerationMs(
                        details, entity.id, category, boonIdNum, durationMs, groupCount, squadCount,
                    )?.generationMs || 0
                );
                if (!Number.isFinite(generationMs) || generationMs <= 0) return;
                generatedAny = true;
                const boonBucket = ensureBoonBucket(boonBuckets, boonId, meta);
                const playerEntry = boonBucket.players.get(key) || {
                    key,
                    account,
                    displayName: account,
                    profession,
                    professionList: profession && profession !== 'Unknown' ? [profession] : [],
                    logs: 0,
                    totals: createBoonCategoryTotals()
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
                addBoonCategoryGeneration(playerEntry.totals, category, generationMs);
                boonBucket.players.set(key, playerEntry);
                const allEntry = boonBucket.players.get('__all__') || {
                    key: '__all__',
                    account: 'All',
                    displayName: 'All',
                    profession: 'All',
                    professionList: [],
                    logs: 0,
                    totals: createBoonCategoryTotals()
                };
                addBoonCategoryGeneration(allEntry.totals, category, generationMs);
                boonBucket.players.set('__all__', allEntry);
                // Record the raw event in the same order it was just applied
                // above (player entry, then `__all__`) so a later slice merge
                // can replay it bit-for-bit — see `BoonRawEvent`.
                const categoryIndex = categories.indexOf(category) as 0 | 1 | 2;
                const rawEvents = fightRawEventsByBoon.get(boonId) || [];
                rawEvents.push({ key, category: categoryIndex, value: generationMs });
                rawEvents.push({ key: '__all__', category: categoryIndex, value: generationMs });
                fightRawEventsByBoon.set(boonId, rawEvents);
                const fightValues = fightValuesByBoon.get(boonId) || new Map<string, { selfBuffs: number; groupBuffs: number; squadBuffs: number; totalBuffs: number }>();
                const playerFightTotals = fightValues.get(key) || createBoonCategoryTotals();
                addBoonCategoryGeneration(playerFightTotals, category, generationMs);
                fightValues.set(key, playerFightTotals);
                const allFightTotals = fightValues.get('__all__') || createBoonCategoryTotals();
                addBoonCategoryGeneration(allFightTotals, category, generationMs);
                fightValues.set('__all__', allFightTotals);
                fightValuesByBoon.set(boonId, fightValues);
            });

            if (!generatedAny) return;
            // Native keys per-source states by entity id (this entity is the
            // recipient; the sources are whoever granted the boon). EI keyed
            // this by character name, which is not unique.
            //
            // This is attributed once per (entity, boonId), not once per
            // category. The pre-existing EI-era code re-derived and re-added
            // the same states inside the per-category loop, so a boon that
            // generated in all three categories got its bucket weights
            // scaled by a data-dependent 1x/2x/3x multiplier -- a bug present
            // in both the EI and native paths, not something this migration
            // introduced. See computeBoonTimeline.test.ts for the regression
            // that pins single attribution.
            const bySource = getEntityBuffStatesPerSource(details, entity.id, boonIdNum);
            if (bySource.size === 0) return;
            const timelineByPlayer = fightBucketTimelineByBoon.get(boonId) || new Map<string, number[]>();
            for (const [sourceEntityId, states] of bySource) {
                const sourceKey = idToKey.get(sourceEntityId);
                if (!sourceKey) continue;
                addBucketWeightsFromStates(
                    timelineByPlayer,
                    sourceKey,
                    states,
                    bucketCount,
                    durationMs
                );
            }
            fightBucketTimelineByBoon.set(boonId, timelineByPlayer);
        });
    });

    fightValuesByBoon.forEach((playerValues, boonId) => {
        const boonBucket = boonBuckets.get(boonId);
        if (!boonBucket) return;
        const timelineByPlayer = fightBucketTimelineByBoon.get(boonId) || new Map<string, number[]>();
        const values: Record<string, BoonFightValue> = {};
        let allBuckets = Array.from({ length: bucketCount }, () => 0);
        let maxTotal = 0;
        playerValues.forEach((rawTotals, playerKey) => {
            const totals = {
                selfBuffs: Number(rawTotals?.selfBuffs || 0),
                groupBuffs: Number(rawTotals?.groupBuffs || 0),
                squadBuffs: Number(rawTotals?.squadBuffs || 0),
                totalBuffs: Number(rawTotals?.totalBuffs || 0)
            };
            const total = Math.max(0, Number(totals.totalBuffs || 0));
            if (!Number.isFinite(total) || total <= 0) return;
            const rawBuckets = timelineByPlayer.get(playerKey) || [];
            const buckets5s = scaleBucketsToTotal(rawBuckets, total, bucketCount);
            values[playerKey] = {
                total,
                totals,
                bucketWeights5s: Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0)),
                buckets5s
            };
            if (playerKey !== '__all__') {
                if (total > maxTotal) maxTotal = total;
                allBuckets = allBuckets.map((value, idx) => Number(value || 0) + Number(buckets5s[idx] || 0));
            }
        });
        const allTotals = playerValues.get('__all__');
        const allTotal = Number(allTotals?.totalBuffs || 0);
        if (allTotal > 0) {
            values.__all__ = {
                total: allTotal,
                totals: {
                    selfBuffs: Number(allTotals?.selfBuffs || 0),
                    groupBuffs: Number(allTotals?.groupBuffs || 0),
                    squadBuffs: Number(allTotals?.squadBuffs || 0),
                    totalBuffs: Number(allTotals?.totalBuffs || 0)
                },
                bucketWeights5s: Array.from({ length: bucketCount }, (_, idx) => Number((timelineByPlayer.get('__all__') || [])[idx] || 0)),
                buckets5s: allBuckets.some((value) => Number(value || 0) > 0)
                    ? allBuckets
                    : scaleBucketsToTotal(timelineByPlayer.get('__all__') || [], allTotal, bucketCount)
            };
        }
        if (Object.keys(values).length === 0) return;
        const allEntry = boonBucket.players.get('__all__');
        if (allEntry) {
            allEntry.logs += 1;
            boonBucket.players.set('__all__', allEntry);
        }
        boonBucket.fights.push({
            id: log.filePath || log.id || `fight-${index + 1}`,
            shortLabel: `F${index + 1}`,
            fullLabel,
            timestamp: resolveFightTimestamp(details, log),
            durationMs,
            values,
            maxTotal,
            events: fightRawEventsByBoon.get(boonId) || []
        });
    });
}

export function finalizeBoonTimeline(acc: BoonTimelineAccumulator): any {
    return Array.from(acc.boonBuckets.values())
        .map((bucket) => ({
            id: bucket.id,
            name: bucket.name || bucket.id,
            icon: bucket.icon,
            stacking: bucket.stacking,
            players: Array.from(bucket.players.values()).sort((a, b) => {
                if (a.key === '__all__') return -1;
                if (b.key === '__all__') return 1;
                const totalDiff = Number(b.totals?.totalBuffs || 0) - Number(a.totals?.totalBuffs || 0);
                if (totalDiff !== 0) return totalDiff;
                return String(a.displayName || '').localeCompare(String(b.displayName || ''));
            }),
            fights: [...bucket.fights]
                .sort((a, b) => {
                    if (a.timestamp > 0 && b.timestamp > 0 && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
                    return a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true });
                })
                // Reassign shortLabels after sort so F1=oldest, F2=next, etc.
                // Labels are assigned during ingestion by insertion order, which may
                // not match chronological order, causing scrambled fight numbers.
                //
                // `events` is dropped here: it is raw per-generation-event data
                // that only exists so a slice merge can replay it bit-exactly
                // (see `BoonRawEvent`); the published `stats` output never reads
                // it and it would otherwise meaningfully bloat every report.
                .map(({ events: _events, ...fight }, i) => ({ ...fight, shortLabel: `F${i + 1}` }))
        }))
        .filter((boon) => boon.players.length > 0 && boon.fights.length > 0)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function computeBoonTimeline(validLogs: any[]) {
    const acc = createBoonTimelineAccumulator();

    const sorted = validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .map(({ log }) => log);

    for (const log of sorted) {
        ingestLogBoonTimeline(log, acc);
    }

    return finalizeBoonTimeline(acc);
}

export interface BoonTimelineFrame {
    boonBuckets: Map<string, BoonBucket>;
}

export function extractBoonTimelineFrame(acc: BoonTimelineAccumulator): BoonTimelineFrame {
    if (acc.logIndex !== 1) {
        throw new Error(`extractBoonTimelineFrame expects exactly one log, got ${acc.logIndex}`);
    }
    return { boonBuckets: acc.boonBuckets };
}

/**
 * Merge one fight's boon buckets into a running accumulator.
 *
 * Every `BoonPlayer` field is a sum or a union — `ingestLogBoonTimeline` only
 * ever adds — so a single-log frame's player map IS that fight's contribution
 * and merging is adding it in. `fights` concatenates; `finalizeBoonTimeline`
 * re-sorts and renumbers.
 */

/**
 * `labels` re-states the ordinal-derived strings at the merge ordinal. Every
 * boon bucket repeats the same per-fight row, so the rewrite walks all of them.
 */
export function mergeBoonTimelineFrame(target: BoonTimelineAccumulator, frame: BoonTimelineFrame, labels: FrameFightLabels): void {
    frame.boonBuckets.forEach((sourceBucket) => {
        sourceBucket.fights.forEach((fight: any) => {
            applyLabel(fight, 'id', labels.fightId);
            applyLabel(fight, 'shortLabel', labels.shortLabel);
            applyLabel(fight, 'fullLabel', labels.fullLabel);
        });
    });
    target.logIndex += 1;
    frame.boonBuckets.forEach((sourceBucket, boonId) => {
        let bucket = target.boonBuckets.get(boonId);
        if (!bucket) {
            bucket = {
                id: sourceBucket.id,
                name: sourceBucket.name,
                icon: sourceBucket.icon,
                stacking: sourceBucket.stacking,
                players: new Map<string, BoonPlayer>(),
                fights: []
            };
            target.boonBuckets.set(boonId, bucket);
        } else {
            if ((!bucket.name || bucket.name === boonId) && sourceBucket.name) bucket.name = sourceBucket.name;
            if (!bucket.icon && sourceBucket.icon) bucket.icon = sourceBucket.icon;
            if (!bucket.stacking && sourceBucket.stacking) bucket.stacking = true;
        }
        sourceBucket.fights.forEach((fight) => bucket!.fights.push(fight));

        // Replay this fight's raw per-event boon generation onto the running
        // cross-fight totals, in the exact order `ingestLogBoonTimeline` would
        // have applied them directly. A frame is always exactly one log (see
        // `extractBoonTimelineFrame`), so `fights[0].events` is that fight's
        // complete, ordered event stream.
        //
        // This is NOT the same as merging `sourcePlayer.totals` in one shot:
        // `totals` is itself the pre-reduced sum of many small per-event
        // additions that started from zero inside the solo frame aggregator.
        // A direct multi-log run never resets between fights — its running
        // total carries a nonzero value into this fight's events — so adding
        // the whole pre-reduced fight total in one step regroups the
        // floating-point arithmetic differently and can drift by an ULP or
        // more (observed on `test-fixtures/native/` at 5+ merged fights: a
        // `squadBuffs` total came out `9298732` direct vs
        // `9298731.999999998` from a one-shot merge). Replaying the
        // individual events reproduces the direct-ingest float bit-for-bit.
        const categoryNames: Array<'selfBuffs' | 'groupBuffs' | 'squadBuffs'> = ['selfBuffs', 'groupBuffs', 'squadBuffs'];
        const events: BoonRawEvent[] = (sourceBucket.fights[0] as any)?.events || [];
        events.forEach((event) => {
            let entry = bucket!.players.get(event.key);
            if (!entry) {
                entry = {
                    key: event.key,
                    account: event.key === '__all__' ? 'All' : event.key,
                    displayName: event.key === '__all__' ? 'All' : event.key,
                    profession: event.key === '__all__' ? 'All' : 'Unknown',
                    professionList: [],
                    logs: 0,
                    totals: createBoonCategoryTotals(),
                };
                bucket!.players.set(event.key, entry);
            }
            addBoonCategoryGeneration(entry.totals, categoryNames[event.category], event.value);
        });

        // Everything else about a player row — profession, professionList,
        // logs — is metadata (unions/integer sums), not a float accumulation,
        // so merging it in one shot is exact. `totals` was already replayed
        // above and must not be touched again here.
        //
        // No `!existing` fallback: every `players` entry here was created
        // moments ago by the event replay loop above (every player is
        // touched by at least one of its own events), so `existing` is
        // guaranteed. A defensive clone-and-continue branch would silently
        // paper over a future divergence between the event stream and
        // `players` instead of surfacing it — let a violation of that
        // invariant throw here rather than hide.
        sourceBucket.players.forEach((sourcePlayer, key) => {
            const existing = bucket!.players.get(key)!;
            existing.logs += sourcePlayer.logs;
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
