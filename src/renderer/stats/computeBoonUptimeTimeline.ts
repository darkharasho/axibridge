import {
    getBuffMeta, listBoonIds, getEntityBuffStatesPerSource, squadEntities, getEntityProfession,
} from '@axiapps/bridge-metrics';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';

type UptimePlayer = {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    total: number;
    peak: number;
};
type UptimeFightValue = {
    total: number;
    peak: number;
    buckets: number[];
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
type UptimeBucket = {
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
const sampleStackTimeline = (
    statesPerSource: Record<string, any>,
    bucketCount: number,
    stacking: boolean,
    boonName: string,
    intervalMs: number
) => {
    const buckets = Array.from({ length: bucketCount }, () => 0);
    if (!statesPerSource || typeof statesPerSource !== 'object' || bucketCount <= 0) return buckets;
    Object.values(statesPerSource).forEach((states: any) => {
        const normalized = normalizeStatePairs(states);
        if (normalized.length === 0) return;
        let stateIndex = 0;
        let currentValue = 0;
        for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
            const sampleTime = bucketIndex * intervalMs;
            while (stateIndex < normalized.length && normalized[stateIndex][0] <= sampleTime) {
                currentValue = Math.max(0, Number(normalized[stateIndex][1] || 0));
                stateIndex += 1;
            }
            buckets[bucketIndex] += Math.max(0, Number(currentValue || 0));
        }
    });
    const stackCap = resolveBoonStackCap(boonName, stacking);
    return buckets.map((value) => normalizeBucketStackValue(value, stacking, stackCap));
};
const createFightValue = (buckets: number[]): UptimeFightValue => {
    const total = buckets.reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
    const peak = buckets.reduce((best, value) => Math.max(best, Math.max(0, Number(value || 0))), 0);
    return { total, peak, buckets };
};

export function createBoonUptimeTimelineAccumulator(
    settings?: { boonBucketIntervalMs: number; stackingBoonBucketIntervalMs: number }
): BoonUptimeTimelineAccumulator {
    return {
        boonBuckets: new Map<string, UptimeBucket>(),
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

    members.forEach((entity) => {
        const account = String(entity.account || entity.character || 'Unknown');
        const key = account;
        const profession = getEntityProfession(entity) || 'Unknown';

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
            const buckets = sampleStackTimeline(
                statesPerSource, boonBucketCount, meta.stacking, meta.name, intervalMs,
            );
            const fightValue = createFightValue(buckets);
            if (fightValue.total <= 0 && fightValue.peak <= 0) return;

            const playerEntry = boonBucket.players.get(key) || {
                key,
                account,
                displayName: account,
                profession,
                professionList: profession && profession !== 'Unknown' ? [profession] : [],
                logs: 0,
                total: 0,
                peak: 0
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
            players: Array.from(bucket.players.values()).sort((a, b) => {
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
