import {
    squadEntities, enemyPlayerEntities, getEntityProfession,
    getEntitySkillRows, getEntityVsTargetSeries, getEntityDamageTakenSeries,
} from '@axiapps/bridge-metrics';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { resolveProfessionLabel } from './computePlayerAggregation';
import { applyLabel, type FrameFightLabels } from './slice/frameLabels';

/**
 * The enemy's own biggest strike, from `by_skill[].max`.
 *
 * Enemies carry NO `outcomes` anywhere in the native container, so every enemy
 * row comes back `indirect: false` and nothing is filtered — which is the
 * correct default: with no flag available there is nothing to exclude, and the
 * EI path's `indirectDamage` filter had nothing to act on for these rows
 * either once a `targetDamageDist` was absent.
 */
const getHighestIncomingStrikeHit = (details: any, entityId: number) => {
    const entity = details?.native?.blocks?.damage?.by_entity?.[String(entityId)];
    let bestValue = 0;
    let bestName = '';
    for (const row of getEntitySkillRows(details, entityId).filter((r) => !r.indirect)) {
        const peak = Number(entity?.by_skill?.[String(row.skillId)]?.max ?? 0);
        if (peak > bestValue) {
            bestValue = peak;
            bestName = row.skillName;
        }
    }
    return { peak: bestValue, skillName: bestName || 'Unknown Skill' };
};

const toPerSecond = (series: number[]) => {
    if (!Array.isArray(series) || series.length === 0) return [] as number[];
    const deltas: number[] = [];
    for (let i = 0; i < series.length; i += 1) {
        const current = Number(series[i] || 0);
        const prev = i > 0 ? Number(series[i - 1] || 0) : 0;
        deltas.push(Math.max(0, current - prev));
    }
    return deltas;
};

const sumSeries = (seriesList: number[][]) => {
    if (!Array.isArray(seriesList) || seriesList.length === 0) return [] as number[];
    const maxLen = seriesList.reduce((len, series) => Math.max(len, Array.isArray(series) ? series.length : 0), 0);
    if (maxLen <= 0) return [] as number[];
    const out = new Array<number>(maxLen).fill(0);
    seriesList.forEach((series) => {
        if (!Array.isArray(series)) return;
        for (let i = 0; i < maxLen; i += 1) {
            out[i] += Number(series[i] || 0);
        }
    });
    return out;
};

const getMaxRollingDamage = (values: number[], window: number) => {
    if (!Array.isArray(values) || values.length === 0 || window <= 0) return 0;
    let sum = 0;
    let best = 0;
    for (let i = 0; i < values.length; i += 1) {
        sum += Number(values[i] || 0);
        if (i >= window) {
            sum -= Number(values[i - window] || 0);
        }
        if (i >= window - 1 && sum > best) best = sum;
    }
    return Math.max(0, best);
};

const getBuckets = (values: number[], bucketSizeSeconds: number) => {
    if (!Array.isArray(values) || values.length === 0 || bucketSizeSeconds <= 0) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < values.length; i += bucketSizeSeconds) {
        const end = Math.min(i + bucketSizeSeconds, values.length);
        const bucket = values.slice(i, end).reduce((sum, value) => sum + Number(value || 0), 0);
        out.push(bucket);
    }
    return out;
};

/**
 * Squad-wide down/death marker indices from `blocks.replay`.
 *
 * Native reports these as `[startMs, endMs]` pairs in FIGHT-relative time, so
 * EI's per-player replay-start offset guessing is gone entirely.
 */
const markerIndices = (details: any, entityIds: number[], field: 'down' | 'dead', bucketCount: number): number[] => {
    if (bucketCount <= 0) return [];
    const byEntity = details?.native?.blocks?.replay?.by_entity ?? {};
    const idx = entityIds.flatMap((id) => {
        const events = byEntity?.[String(id)]?.[field];
        return Array.isArray(events) ? events.map((e: any) => Number(Array.isArray(e) ? e[0] : e)) : [];
    })
        .filter((value) => Number.isFinite(value) && value >= 0)
        .map((value) => Math.floor(value / 5000))
        .filter((i) => i >= 0 && i < bucketCount);
    return Array.from(new Set(idx));
};

// --- Types ---

export type IncomingStrikeFightValue = {
    hit: number;
    burst1s: number;
    burst5s: number;
    burst30s: number;
    totalDamage: number;
    skillName: string;
    buckets5s: number[];
    downIndices5s: number[];
    deathIndices5s: number[];
    skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
};

export type IncomingStrikeFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    values: Record<string, IncomingStrikeFightValue>;
    maxHit: number;
    max1s: number;
    max5s: number;
    max30s: number;
    maxTotal: number;
};

export type IncomingStrikePlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    peakHit: number;
    peak1s: number;
    peak5s: number;
    peak30s: number;
    totalDamage: number;
    peakFightLabel: string;
    peakSkillName: string;
};

export interface IncomingStrikeDamageAccumulator {
    fights: IncomingStrikeFight[];
    playerMap: Map<string, IncomingStrikePlayer>;
    /** Running fight index counter. */
    fightIndex: number;
}

export function createIncomingStrikeDamageAccumulator(): IncomingStrikeDamageAccumulator {
    return {
        fights: [],
        playerMap: new Map(),
        fightIndex: 0,
    };
}

/**
 * Fold one fight's per-profession values into the running player map. Shared by
 * `ingestLogIncomingStrikeDamage` and `mergeIncomingStrikeFrame`. This map is
 * keyed by profession, so the fight object already carries every identity field
 * the fold needs - hence no seeds.
 */
export function foldIncomingStrikeFightIntoPlayers(
    fight: IncomingStrikeFight,
    playerMap: Map<string, IncomingStrikePlayer>,
): void {
    Object.entries(fight.values).forEach(([profession, value]) => {
        const existing = playerMap.get(profession) || {
            key: profession,
            account: profession,
            displayName: profession,
            characterName: '',
            profession,
            professionList: [profession],
            logs: 0,
            peakHit: 0,
            peak1s: 0,
            peak5s: 0,
            peak30s: 0,
            totalDamage: 0,
            peakFightLabel: '',
            peakSkillName: ''
        };
        existing.totalDamage += Number(value.totalDamage || 0);
        existing.logs += 1;
        const hit = Number(value.hit || 0);
        if (hit > existing.peakHit) {
            existing.peakHit = hit;
            existing.peakFightLabel = fight.fullLabel;
            existing.peakSkillName = value.skillName || 'Unknown Skill';
        }
        if (value.burst1s > existing.peak1s) existing.peak1s = value.burst1s;
        if (value.burst5s > existing.peak5s) existing.peak5s = value.burst5s;
        if (value.burst30s > existing.peak30s) existing.peak30s = value.burst30s;
        playerMap.set(profession, existing);
    });
}

export function ingestLogIncomingStrikeDamage(log: any, acc: IncomingStrikeDamageAccumulator): void {
    const details = log?.details;
    if (!details) return;

    const index = acc.fightIndex++;
    const fullLabel = buildFightLabelV2({
        zone: details.fightName || log.fightName || `Fight ${index + 1}`,
        durationMs: details.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
    const values: Record<string, IncomingStrikeFightValue> = {};
    const members = squadEntities(details?.native);
    const memberIds = members.map((m) => m.id);
    const classSeries = new Map<string, { perSecond: number[]; hit: number; skillName: string }>();
    const classSkillRows = new Map<string, Map<string, { skillName: string; damage: number; hits: number; icon?: string }>>();
    const classCounts = new Map<string, number>();
    // `enemyPlayerEntities` is native's equivalent of EI's curated `targets[]`:
    // the role filter is applied upstream, and there are no fake targets.
    enemyPlayerEntities(details?.native).forEach((enemy) => {
        const profession = resolveProfessionLabel(getEntityProfession(enemy) || String(enemy.id)) || 'Unknown';
        classCounts.set(profession, (classCounts.get(profession) || 0) + 1);
        const skillBucket = classSkillRows.get(profession) || new Map<string, { skillName: string; damage: number; hits: number; icon?: string }>();
        getEntitySkillRows(details, enemy.id)
            .filter((row) => !row.indirect && row.damage > 0)
            .forEach((entry) => {
                const row = skillBucket.get(entry.skillName)
                    || { skillName: entry.skillName, damage: 0, hits: 0, icon: entry.icon };
                row.damage += entry.damage;
                row.hits += entry.connectedHits || entry.hits;
                if (!row.icon && entry.icon) row.icon = entry.icon;
                skillBucket.set(entry.skillName, row);
            });
        classSkillRows.set(profession, skillBucket);

        // The per-class series is squad OUTGOING power damage against this
        // enemy, keyed by entity id instead of EI's target array index. That
        // proxy is preserved deliberately -- see the unit 4 plan's non-goals.
        const squadTargetCumulative = sumSeries(memberIds.map((id) =>
            getEntityVsTargetSeries(details, id, enemy.id, { power: true })
        ));
        const strikeSeries = toPerSecond(squadTargetCumulative);
        const bestHit = getHighestIncomingStrikeHit(details, enemy.id);
        let bucket = classSeries.get(profession);
        if (!bucket) {
            bucket = { perSecond: [], hit: 0, skillName: '' };
            classSeries.set(profession, bucket);
        }
        if (strikeSeries.length > bucket.perSecond.length) {
            bucket.perSecond.length = strikeSeries.length;
        }
        for (let i = 0; i < strikeSeries.length; i += 1) {
            bucket.perSecond[i] = Number(bucket.perSecond[i] || 0) + Number(strikeSeries[i] || 0);
        }
        const peakHit = Number(bestHit.peak || 0);
        if (peakHit > bucket.hit) {
            bucket.hit = peakHit;
            bucket.skillName = bestHit.skillName || 'Unknown Skill';
        }
    });

    // Fallback: if enemy target timelines are unavailable (or present but empty), distribute
    // squad incoming strike by enemy class counts so burst/drilldown still work.
    const hasClassTimelineData = Array.from(classSeries.values()).some((entry) =>
        Array.isArray(entry.perSecond) && entry.perSecond.some((value) => Number(value || 0) > 0)
    );
    if (classSeries.size === 0 || !hasClassTimelineData) {
        const squadIncomingSeries = sumSeries(memberIds.map((id) =>
            toPerSecond(getEntityDamageTakenSeries(details, id, { power: true }))
        ));
        const totalClassCount = Array.from(classCounts.values()).reduce((sum, count) => sum + Number(count || 0), 0);
        if (squadIncomingSeries.length > 0 && totalClassCount > 0) {
            classCounts.forEach((count, profession) => {
                const weight = Number(count || 0) / totalClassCount;
                const weightedSeries = squadIncomingSeries.map((value) => Number(value || 0) * weight);
                const existing = classSeries.get(profession);
                classSeries.set(profession, {
                    perSecond: weightedSeries,
                    hit: Number(existing?.hit || 0),
                    skillName: String(existing?.skillName || '')
                });
            });
        }
    }

    classSeries.forEach((entry, profession) => {
        const key = profession;
        const hit = Number(entry.hit || 0);
        const burst1s = Number(getMaxRollingDamage(entry.perSecond, 1) || 0);
        const burst5s = Number(getMaxRollingDamage(entry.perSecond, 5) || 0);
        const burst30s = Number(getMaxRollingDamage(entry.perSecond, 30) || 0);
        const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / 5000));
        const damageBuckets = Math.max(0, Math.ceil(entry.perSecond.length / 5));
        const bucketCount = Math.max(durationBuckets, damageBuckets);
        const rawBuckets = getBuckets(entry.perSecond, 5);
        const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));
        const totalDamage = buckets5s.reduce((sum, value) => sum + Number(value || 0), 0);
        values[key] = {
            hit,
            burst1s,
            burst5s,
            burst30s,
            totalDamage,
            skillName: entry.skillName || 'Unknown Skill',
            buckets5s,
            downIndices5s: markerIndices(details, memberIds, 'down', bucketCount),
            deathIndices5s: markerIndices(details, memberIds, 'dead', bucketCount),
            skillRows: Array.from(classSkillRows.get(profession)?.values() || [])
                .sort((a, b) => b.damage - a.damage)
                .slice(0, 50)
        };
    });

    const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
    const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
    const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
    const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
    const maxTotal = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.totalDamage || 0)), 0);
    const fight: IncomingStrikeFight = {
        id: log.filePath || log.id || `fight-${index + 1}`,
        shortLabel: `F${index + 1}`,
        fullLabel,
        timestamp: resolveFightTimestamp(details, log),
        values,
        maxHit,
        max1s,
        max5s,
        max30s,
        maxTotal
    };
    acc.fights.push(fight);
    foldIncomingStrikeFightIntoPlayers(fight, acc.playerMap);
}

export function finalizeIncomingStrikeDamage(acc: IncomingStrikeDamageAccumulator): { fights: IncomingStrikeFight[]; players: IncomingStrikePlayer[] } {
    const players = Array.from(acc.playerMap.values()).sort((a, b) => {
        if (b.peakHit !== a.peakHit) return b.peakHit - a.peakHit;
        return a.displayName.localeCompare(b.displayName);
    });

    const fights = [...acc.fights]
        .sort((a, b) => {
            if (a.timestamp > 0 && b.timestamp > 0 && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            return a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true });
        })
        .map((fight, i) => ({ ...fight, shortLabel: `F${i + 1}` }));

    return { fights, players };
}

export interface IncomingStrikeFrame {
    fight: IncomingStrikeFight;
}

export function extractIncomingStrikeFrame(acc: IncomingStrikeDamageAccumulator): IncomingStrikeFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractIncomingStrikeFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0] };
}


/**
 * `labels` re-states the ordinal-derived strings at the merge ordinal. A frame
 * is always built by a solo aggregator, so `fight.id` / `shortLabel` are baked
 * at ordinal 0 and `fullLabel` carries the `Fight 1` zone fallback whenever the
 * log named no zone. They are rewritten BEFORE the player fold, so the fold's
 * `peakFightLabel` picks up the corrected string for free.
 */
export function mergeIncomingStrikeFrame(
    target: IncomingStrikeDamageAccumulator,
    frame: IncomingStrikeFrame,
    labels: FrameFightLabels,
): void {
    applyLabel(frame.fight, 'id', labels.fightId);
    applyLabel(frame.fight, 'shortLabel', labels.shortLabel);
    applyLabel(frame.fight, 'fullLabel', labels.fullLabel);
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    foldIncomingStrikeFightIntoPlayers(frame.fight, target.playerMap);
}

export function computeIncomingStrikeDamageData(validLogs: any[]) {
    const sorted = validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .map(({ log }) => log);

    const acc = createIncomingStrikeDamageAccumulator();
    for (const log of sorted) ingestLogIncomingStrikeDamage(log, acc);
    return finalizeIncomingStrikeDamage(acc);
}
