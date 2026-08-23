import {
    squadEntities, getEntityProfession,
    getEntityDamageSeries, getEntityTargetDamageSeries, getEntitySkillRows,
    getEntityDownContributionBySkill, type NativeSkillRow,
} from '@axiapps/bridge-metrics';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { applyLabel, type FrameFightLabels } from './slice/frameLabels';

/**
 * Strike-damage skill rows for one entity, per-target first.
 *
 * `per_target.by_skill` carries no `outcomes`, so `getEntitySkillRows` joins
 * the `indirect` flag from the entity's own top-level rows; filtering on it is
 * what keeps condition ticks out of every number in this module.
 */
const getStrikeRows = (details: any, entityId: number): NativeSkillRow[] => {
    // `supplement` adds back damage with no per-target row — splash, and hits
    // on uncurated entities — which is EI's totalDamageDist reconciliation.
    // Detailed WvW logs suppress it: there the per-target slices are
    // authoritative and the totals carry outliers EI never resolved.
    const supplement = !details?.detailedWvW;
    const perTarget = getEntitySkillRows(details, entityId, { perTarget: true, supplement })
        .filter((r) => !r.indirect);
    if (perTarget.length > 0) return perTarget;
    return getEntitySkillRows(details, entityId).filter((r) => !r.indirect);
};

const getHighestSingleHit = (details: any, entityId: number) => {
    // `max` lives on the per-skill records in both by_skill and per_target,
    // so the peak hit no longer needs EI's corrupted-entry guard: native's max
    // is a real observed hit, not a derived figure that could exceed the total.
    const entity = details?.native?.blocks?.damage?.by_entity?.[String(entityId)];
    const targets = Object.values<any>(entity?.per_target ?? {});
    // When per-target slices exist they are the ONLY source of the peak, even
    // if `by_skill` reports a larger max for some skill: that larger figure is
    // damage against something the log did not curate, and EI's equivalent
    // rule existed because those totals carry known-bogus outliers.
    const rows = getEntitySkillRows(details, entityId, { perTarget: targets.length > 0 })
        .filter((r) => !r.indirect);
    const maxOf = (skillId: number): number => {
        if (targets.length === 0) return Number(entity?.by_skill?.[String(skillId)]?.max ?? 0);
        let best = 0;
        for (const target of targets) {
            best = Math.max(best, Number(target?.by_skill?.[String(skillId)]?.max ?? 0));
        }
        return best;
    };

    const downBySkill = getEntityDownContributionBySkill(details, entityId);
    let bestValue = 0;
    let bestName = '';
    let bestDownContribution = 0;
    for (const row of rows) {
        const peak = maxOf(row.skillId);
        if (peak > bestValue) {
            bestValue = peak;
            bestName = row.skillName;
        }
        const downContribution = downBySkill.get(row.skillId) ?? 0;
        if (downContribution > bestDownContribution) bestDownContribution = downContribution;
    }
    return { peak: bestValue, peakDownContribution: bestDownContribution, skillName: bestName || 'Unknown Skill' };
};

const getPerSecondDamageSeries = (details: any, entityId: number): { perSecond: number[]; usedFallback: boolean } => {
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
    // Per-target excludes minions and splash that landed on nothing tracked;
    // the entity total is the fallback, and carries both, which is why the
    // caller still scales it by the personal ratio.
    const targetCumulative = getEntityTargetDamageSeries(details, entityId);
    const usedFallback = targetCumulative.length === 0;
    const cumulative = usedFallback ? getEntityDamageSeries(details, entityId) : targetCumulative;
    return { perSecond: toPerSecond(cumulative), usedFallback };
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

const getDamageAndDownContributionTotals = (details: any, entityId: number) => {
    const downBySkill = getEntityDownContributionBySkill(details, entityId);
    let damageTotal = 0;
    let downContributionTotal = 0;
    for (const row of getStrikeRows(details, entityId)) {
        damageTotal += row.damage;
        downContributionTotal += downBySkill.get(row.skillId) ?? 0;
    }
    return {
        damageTotal: Math.max(0, damageTotal),
        downContributionTotal: Math.max(0, downContributionTotal)
    };
};

/**
 * Down/death marker times for one entity, from `blocks.replay`.
 *
 * These are `[startMs, endMs]` pairs in FIGHT-relative milliseconds, which is
 * why the EI path's offset-and-unit guessing is gone: EI reported them in
 * session time against a replay start that had to be inferred per player.
 */
const markerIndices = (events: any, bucketCount: number): number[] => {
    if (!Array.isArray(events) || bucketCount <= 0) return [];
    return Array.from(new Set(events
        .map((entry: any) => Number(Array.isArray(entry) ? entry[0] : entry))
        .filter((value: number) => Number.isFinite(value) && value >= 0)
        .map((value: number) => Math.floor(value / 5000))
        .filter((idx: number) => idx >= 0 && idx < bucketCount)));
};

// --- Types ---

export type SpikeDamageFightValue = {
    hit: number;
    burst1s: number;
    burst5s: number;
    burst30s: number;
    hitDown: number;
    burst1sDown: number;
    burst5sDown: number;
    burst30sDown: number;
    skillName: string;
    buckets5s: number[];
    buckets5sDown: number[];
    downIndices5s: number[];
    deathIndices5s: number[];
    skillRows?: Array<{ skillName: string; damage: number; downContribution?: number; hits: number; icon?: string }>;
};

export type SpikeDamageFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    values: Record<string, SpikeDamageFightValue>;
    maxHit: number;
    max1s: number;
    max5s: number;
    max30s: number;
    maxHitDown: number;
    max1sDown: number;
    max5sDown: number;
    max30sDown: number;
};

export type SpikeDamagePlayer = {
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
    peakHitDown: number;
    peak1sDown: number;
    peak5sDown: number;
    peak30sDown: number;
    peakFightLabel: string;
    peakSkillName: string;
};

export interface SpikeDamagePlayerSeed {
    account: string;
    characterName: string;
    profession: string;
}

export interface SpikeDamageAccumulator {
    fights: SpikeDamageFight[];
    playerMap: Map<string, SpikeDamagePlayer>;
    /** Running fight index counter. */
    fightIndex: number;
    /** Per-fight player identity, parallel to `fights`. Not part of any
     *  finalize output — this exists so a slice frame can re-run the player
     *  fold without the original log. */
    fightSeeds: Array<Record<string, SpikeDamagePlayerSeed>>;
}

export interface SpikeDamageIngestOptions {
    splitPlayersByClass?: boolean;
}

export function createSpikeDamageAccumulator(): SpikeDamageAccumulator {
    return {
        fights: [],
        playerMap: new Map(),
        fightIndex: 0,
        fightSeeds: [],
    };
}

/**
 * Fold one fight's player values into the running player map.
 *
 * Shared by `ingestLogSpikeDamage` and `mergeSpikeDamageFrame` on purpose:
 * one fold means slice-mode peaks cannot drift from all-fights peaks.
 */
export function foldSpikeFightIntoPlayers(
    fight: SpikeDamageFight,
    seeds: Record<string, SpikeDamagePlayerSeed>,
    playerMap: Map<string, SpikeDamagePlayer>,
): void {
    Object.entries(fight.values).forEach(([key, value]) => {
        const seed = seeds[key] || { account: key, characterName: '', profession: 'Unknown' };
        const existing = playerMap.get(key) || {
            key,
            account: seed.account,
            displayName: seed.account,
            characterName: seed.characterName,
            profession: seed.profession,
            professionList: [seed.profession],
            logs: 0,
            peakHit: 0,
            peak1s: 0,
            peak5s: 0,
            peak30s: 0,
            peakHitDown: 0,
            peak1sDown: 0,
            peak5sDown: 0,
            peak30sDown: 0,
            peakFightLabel: '',
            peakSkillName: '',
        };
        existing.logs += 1;
        if (!existing.professionList.includes(seed.profession)) {
            existing.professionList.push(seed.profession);
        }
        if (!existing.characterName && seed.characterName) {
            existing.characterName = seed.characterName;
        }
        const hit = Number(value.hit || 0);
        if (hit > existing.peakHit) {
            existing.peakHit = hit;
            existing.peakFightLabel = fight.fullLabel;
            existing.peakSkillName = value.skillName || 'Unknown Skill';
        }
        if (value.burst1s > existing.peak1s) existing.peak1s = value.burst1s;
        if (value.burst5s > existing.peak5s) existing.peak5s = value.burst5s;
        if (value.burst30s > existing.peak30s) existing.peak30s = value.burst30s;
        if (value.hitDown > existing.peakHitDown) existing.peakHitDown = value.hitDown;
        if (value.burst1sDown > existing.peak1sDown) existing.peak1sDown = value.burst1sDown;
        if (value.burst5sDown > existing.peak5sDown) existing.peak5sDown = value.burst5sDown;
        if (value.burst30sDown > existing.peak30sDown) existing.peak30sDown = value.burst30sDown;
        playerMap.set(key, existing);
    });
}

export function ingestLogSpikeDamage(log: any, acc: SpikeDamageAccumulator, options: SpikeDamageIngestOptions = {}): void {
    const splitPlayersByClass = options.splitPlayersByClass ?? false;
    const details = log?.details;
    if (!details) return;

    const index = acc.fightIndex++;
    const fullLabel = buildFightLabelV2({
        zone: details.fightName || log.fightName || `Fight ${index + 1}`,
        durationMs: details.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
    const values: Record<string, SpikeDamageFightValue> = {};
    const seeds: Record<string, SpikeDamagePlayerSeed> = {};
    const members = squadEntities(details?.native);
    members.forEach((entity) => {
        const account = String(entity?.account || entity?.character || 'Unknown');
        const characterName = String(entity?.character || '');
        // EI's `profession` is native's `elite_spec` — getEntityProfession maps it.
        const profession = String(getEntityProfession(entity) || 'Unknown');
        const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;
        const spike = getHighestSingleHit(details, entity.id);
        const hit = Number(spike.peak || 0);
        const hitDown = Number(spike.peakDownContribution || 0);
        const { perSecond: perSecondRaw, usedFallback } = getPerSecondDamageSeries(details, entity.id);
        const { damageTotal, downContributionTotal } = getDamageAndDownContributionTotals(details, entity.id);
        // When the entity-total series was used it includes minion damage.
        // Scale down to personal-only damage using the per-skill strike totals.
        const perSecondTotal = usedFallback ? perSecondRaw.reduce((sum, v) => sum + v, 0) : 0;
        const personalRatio = usedFallback && perSecondTotal > 0 && damageTotal > 0 && damageTotal < perSecondTotal
            ? Math.min(1, damageTotal / perSecondTotal)
            : 1;
        const perSecond = personalRatio < 1
            ? perSecondRaw.map((v) => Math.round(v * personalRatio))
            : perSecondRaw;
        const downRatio = damageTotal > 0 ? Math.min(1, Math.max(0, downContributionTotal / damageTotal)) : 0;
        const perSecondDown = perSecond.map((value) => Number(value || 0) * downRatio);
        const burst1s = Number(getMaxRollingDamage(perSecond, 1) || 0);
        const burst5s = Number(getMaxRollingDamage(perSecond, 5) || 0);
        const burst30s = Number(getMaxRollingDamage(perSecond, 30) || 0);
        const burst1sDown = Number(getMaxRollingDamage(perSecondDown, 1) || 0);
        const burst5sDown = Number(getMaxRollingDamage(perSecondDown, 5) || 0);
        const burst30sDown = Number(getMaxRollingDamage(perSecondDown, 30) || 0);
        const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / 5000));
        const damageBuckets = Math.max(0, Math.ceil(perSecond.length / 5));
        const downBuckets = Math.max(0, Math.ceil(perSecondDown.length / 5));
        const bucketCount = Math.max(durationBuckets, damageBuckets, downBuckets);
        const rawBuckets = getBuckets(perSecond, 5);
        const rawBucketsDown = getBuckets(perSecondDown, 5);
        const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));
        const buckets5sDown = Array.from({ length: bucketCount }, (_, idx) => Number(rawBucketsDown[idx] || 0));
        const downBySkill = getEntityDownContributionBySkill(details, entity.id);
        const skillRows = getStrikeRows(details, entity.id)
            .map((row) => ({
                skillName: row.skillName,
                damage: row.damage,
                downContribution: downBySkill.get(row.skillId) ?? 0,
                hits: row.connectedHits || row.hits,
                icon: row.icon,
            }))
            .filter((row) => row.damage > 0 || row.downContribution > 0)
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 50);
        const replay = details?.native?.blocks?.replay?.by_entity?.[String(entity.id)];
        values[key] = {
            hit,
            burst1s,
            burst5s,
            burst30s,
            hitDown,
            burst1sDown,
            burst5sDown,
            burst30sDown,
            skillName: spike.skillName || 'Unknown Skill',
            buckets5s,
            buckets5sDown,
            downIndices5s: markerIndices(replay?.down, bucketCount),
            deathIndices5s: markerIndices(replay?.dead, bucketCount),
            skillRows
        };
        seeds[key] = { account, characterName, profession };
    });

    const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
    const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
    const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
    const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
    const maxHitDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hitDown || 0)), 0);
    const max1sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1sDown || 0)), 0);
    const max5sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5sDown || 0)), 0);
    const max30sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30sDown || 0)), 0);
    const fight: SpikeDamageFight = {
        id: log.filePath || log.id || `fight-${index + 1}`,
        shortLabel: `F${index + 1}`,
        fullLabel,
        timestamp: resolveFightTimestamp(details, log),
        values,
        maxHit,
        max1s,
        max5s,
        max30s,
        maxHitDown,
        max1sDown,
        max5sDown,
        max30sDown
    };
    acc.fights.push(fight);
    acc.fightSeeds.push(seeds);
    foldSpikeFightIntoPlayers(fight, seeds, acc.playerMap);
}

export function finalizeSpikeDamage(acc: SpikeDamageAccumulator): { fights: SpikeDamageFight[]; players: SpikeDamagePlayer[] } {
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

export interface SpikeDamageFrame {
    fight: SpikeDamageFight;
    seeds: Record<string, SpikeDamagePlayerSeed>;
}

export function extractSpikeDamageFrame(acc: SpikeDamageAccumulator): SpikeDamageFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractSpikeDamageFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0], seeds: acc.fightSeeds[0] || {} };
}


/**
 * `labels` re-states the ordinal-derived strings at the merge ordinal. A frame
 * is always built by a solo aggregator, so `fight.id` / `shortLabel` are baked
 * at ordinal 0 and `fullLabel` carries the `Fight 1` zone fallback whenever the
 * log named no zone. They are rewritten BEFORE the player fold, so the fold's
 * `peakFightLabel` picks up the corrected string for free.
 */
export function mergeSpikeDamageFrame(target: SpikeDamageAccumulator, frame: SpikeDamageFrame, labels: FrameFightLabels): void {
    applyLabel(frame.fight, 'id', labels.fightId);
    applyLabel(frame.fight, 'shortLabel', labels.shortLabel);
    applyLabel(frame.fight, 'fullLabel', labels.fullLabel);
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    target.fightSeeds.push(frame.seeds);
    foldSpikeFightIntoPlayers(frame.fight, frame.seeds, target.playerMap);
}

export function computeSpikeDamageData(validLogs: any[], splitPlayersByClass = false) {
    const sorted = validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .map(({ log }) => log);

    const acc = createSpikeDamageAccumulator();
    for (const log of sorted) ingestLogSpikeDamage(log, acc, { splitPlayersByClass });
    return finalizeSpikeDamage(acc);
}
