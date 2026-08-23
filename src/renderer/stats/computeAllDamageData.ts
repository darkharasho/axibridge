import {
    squadEntities, getEntityProfession,
    getEntityDamageSeries, getEntityTargetDamageSeries, getEntitySkillRows,
    getEntityDamageTotal, getEntityDownContribution, getEntityDownContributionBySkill,
} from '@axiapps/bridge-metrics';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { getFightOutcome } from './computePlayerAggregation';

export interface AllDamagePlayerBucket {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    buckets5s: number[];
    buckets5sDown: number[];
    totalDamage: number;
    totalDownContribution: number;
    skillRows: Array<{ skillName: string; damage: number; downContribution: number; hits: number; icon?: string }>;
}

export interface AllDamageFight {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    totalDamage: number;
    totalDownContribution: number;
    durationMs: number;
    isWin: boolean | null;
    players: AllDamagePlayerBucket[];
}

export interface AllDamagePlayer {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    totalDamage: number;
    totalDownContribution: number;
}

export interface AllDamageData {
    fights: AllDamageFight[];
    players: AllDamagePlayer[];
}

export interface AllDamageAccumulator {
    fights: AllDamageFight[];
    playerAgg: Map<string, AllDamagePlayer>;
    /** Running fight index counter. */
    fightIndex: number;
}

export interface AllDamageIngestOptions {
    splitPlayersByClass?: boolean;
}

function toPerSecond(series: number[]): number[] {
    if (!Array.isArray(series) || series.length === 0) return [];
    const deltas: number[] = [];
    for (let i = 0; i < series.length; i++) {
        const current = Number(series[i] || 0);
        const prev = i > 0 ? Number(series[i - 1] || 0) : 0;
        deltas.push(Math.max(0, current - prev));
    }
    return deltas;
}

function getBuckets(values: number[], bucketSize: number): number[] {
    if (!Array.isArray(values) || values.length === 0 || bucketSize <= 0) return [];
    const out: number[] = [];
    for (let i = 0; i < values.length; i += bucketSize) {
        const end = Math.min(i + bucketSize, values.length);
        let sum = 0;
        for (let j = i; j < end; j++) sum += Number(values[j] || 0);
        out.push(sum);
    }
    return out;
}

/**
 * Per-skill strike-damage rows for one squad member.
 *
 * `per_target.by_skill` is preferred over the entity's top-level `by_skill`
 * for the same reason the EI path preferred `targetDamageDist`: it excludes
 * minions and splash that never landed on a tracked enemy. It carries no
 * `outcomes`, though, so `getEntitySkillRows` joins the `indirect` flag back
 * from the entity's own top-level rows — without that join every condition
 * tick would be counted here as strike damage.
 */
function extractSkillRows(details: any, entityId: number): AllDamagePlayerBucket['skillRows'] {
    const downBySkill = getEntityDownContributionBySkill(details, entityId);
    return getEntitySkillRows(details, entityId, { perTarget: true })
        .filter((row) => !row.indirect)
        .map((row) => ({
            skillName: row.skillName,
            damage: row.damage,
            downContribution: downBySkill.get(row.skillId) ?? 0,
            hits: row.hits,
            icon: row.icon,
        }))
        .filter((row) => row.damage > 0 || row.downContribution > 0)
        .sort((a, b) => b.damage - a.damage);
}

export function createAllDamageAccumulator(): AllDamageAccumulator {
    return {
        fights: [],
        playerAgg: new Map(),
        fightIndex: 0,
    };
}

/**
 * Fold one fight's player buckets into the running player aggregate. Shared by
 * `ingestLogAllDamage` and `mergeAllDamageFrame`, so slice-mode totals cannot
 * drift from all-fights totals. Every field it needs already lives on the
 * bucket, which is why this module's frame carries no seeds.
 */
export function foldAllDamageFightIntoPlayers(
    fight: AllDamageFight,
    playerAgg: Map<string, AllDamagePlayer>,
): void {
    fight.players.forEach((bucket) => {
        const existing = playerAgg.get(bucket.key);
        if (existing) {
            existing.logs += 1;
            existing.totalDamage += bucket.totalDamage;
            existing.totalDownContribution += bucket.totalDownContribution;
            if (!existing.professionList.includes(bucket.profession) && bucket.profession !== 'Unknown') {
                existing.professionList.push(bucket.profession);
            }
        } else {
            playerAgg.set(bucket.key, {
                key: bucket.key,
                account: bucket.account,
                displayName: bucket.displayName,
                profession: bucket.profession,
                professionList: [bucket.profession].filter((p) => p !== 'Unknown'),
                logs: 1,
                totalDamage: bucket.totalDamage,
                totalDownContribution: bucket.totalDownContribution,
            });
        }
    });
}

export function ingestLogAllDamage(log: any, acc: AllDamageAccumulator, options: AllDamageIngestOptions = {}): void {
    const splitPlayersByClass = options.splitPlayersByClass ?? false;
    const details = log?.details;
    if (!details) return;

    const index = acc.fightIndex++;
    const fullLabel = buildFightLabelV2({
        zone: details.fightName || log.fightName || `Fight ${index + 1}`,
        durationMs: details.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
    const durationMs = Number(details.durationMS || 0);
    // `squadEntities` already applies EI's `notInSquad` filter: native gives
    // pugs their own `friendly_player` role rather than a flag on a squad row.
    const members = squadEntities(details?.native);

    const fightPlayers: AllDamagePlayerBucket[] = [];
    let fightTotalDamage = 0;
    let fightTotalDown = 0;

    members.forEach((entity) => {
        const account = String(entity?.account || entity?.character || 'Unknown');
        const characterName = String(entity?.character || '');
        // The profession mapping trap: EI's `profession` is native's
        // `elite_spec`, which is the spelling every lookup table is keyed on.
        // getEntityProfession applies that — never read entity.profession here.
        const profession = String(getEntityProfession(entity) || 'Unknown');
        const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;

        // Per-target first (excludes minions and untracked splash), total as
        // the fallback — the same preference the EI path expressed through
        // targetDamage1S over damage1S. Both are cumulative, so the delta pass
        // below is unchanged.
        const targetCumulative = getEntityTargetDamageSeries(details, entity.id);
        const cumulative = targetCumulative.length > 0
            ? targetCumulative
            : getEntityDamageSeries(details, entity.id);
        const perSecond = toPerSecond(cumulative);
        const durationBuckets = Math.max(0, Math.ceil(durationMs / 5000));
        const damageBuckets = Math.max(0, Math.ceil(perSecond.length / 5));
        const bucketCount = Math.max(durationBuckets, damageBuckets);
        const rawBuckets = getBuckets(perSecond, 5);
        const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));

        // Per-player damage total from the damage block, or the series sum.
        const totalDamage = getEntityDamageTotal(details, entity.id)
            || perSecond.reduce((sum, v) => sum + v, 0);
        const totalDownContribution = getEntityDownContribution(details, entity.id);

        // Down contribution 5s buckets (proportional)
        const downRatio = totalDamage > 0 ? Math.min(1, Math.max(0, totalDownContribution / totalDamage)) : 0;
        const buckets5sDown = buckets5s.map((v) => Math.round(v * downRatio));

        const skillRows = extractSkillRows(details, entity.id);

        fightPlayers.push({
            key,
            account,
            displayName: characterName || account,
            profession,
            professionList: [profession].filter((p) => p !== 'Unknown'),
            buckets5s,
            buckets5sDown,
            totalDamage,
            totalDownContribution,
            skillRows,
        });

        fightTotalDamage += totalDamage;
        fightTotalDown += totalDownContribution;
    });

    // Sort players within fight by total damage descending
    fightPlayers.sort((a, b) => b.totalDamage - a.totalDamage);

    const isWin = members.length > 0 ? getFightOutcome(details) : null;

    const fight: AllDamageFight = {
        id: String(log?.filePath || log?.id || `fight-${index + 1}`),
        shortLabel: `F${index + 1}`,
        fullLabel,
        timestamp: resolveFightTimestamp(details, log),
        totalDamage: fightTotalDamage,
        totalDownContribution: fightTotalDown,
        durationMs,
        isWin,
        players: fightPlayers,
    };
    acc.fights.push(fight);
    foldAllDamageFightIntoPlayers(fight, acc.playerAgg);
}

export function finalizeAllDamage(acc: AllDamageAccumulator): AllDamageData {
    const players = Array.from(acc.playerAgg.values()).sort((a, b) => b.totalDamage - a.totalDamage);

    const fights = [...acc.fights]
        .sort((a, b) => {
            if (a.timestamp > 0 && b.timestamp > 0 && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            return a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true });
        })
        .map((fight, i) => ({ ...fight, shortLabel: `F${i + 1}` }));

    return { fights, players };
}

export interface AllDamageFrame {
    fight: AllDamageFight;
}

export function extractAllDamageFrame(acc: AllDamageAccumulator): AllDamageFrame {
    if (acc.fights.length !== 1) {
        throw new Error(`extractAllDamageFrame expects exactly one fight, got ${acc.fights.length}`);
    }
    return { fight: acc.fights[0] };
}

export function mergeAllDamageFrame(target: AllDamageAccumulator, frame: AllDamageFrame): void {
    target.fightIndex += 1;
    target.fights.push(frame.fight);
    foldAllDamageFightIntoPlayers(frame.fight, target.playerAgg);
}

export function computeAllDamageData(validLogs: any[], splitPlayersByClass = false): AllDamageData {
    const sorted = validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .map(({ log }) => log);

    const acc = createAllDamageAccumulator();
    for (const log of sorted) ingestLogAllDamage(log, acc, { splitPlayersByClass });
    return finalizeAllDamage(acc);
}
