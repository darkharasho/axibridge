import { resolveFightTimestamp } from './utils/timestampUtils';
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';

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

function sumCumulativeTargets(targetSeries: any[]): number[] {
    if (!Array.isArray(targetSeries)) return [];
    const maxLen = targetSeries.reduce((len: number, s: any) => Math.max(len, Array.isArray(s) ? s.length : 0), 0);
    if (maxLen <= 0) return [];
    const summed = new Array<number>(maxLen).fill(0);
    targetSeries.forEach((s: any) => {
        if (!Array.isArray(s)) return;
        for (let i = 0; i < maxLen; i++) summed[i] += Number(s[i] || 0);
    });
    return summed;
}

function extractPerSecondDamage(player: any): number[] {
    // Try targetDamage1S first (excludes pet/minion), fall back to damage1S
    const extractTargetPhase0 = (targetDamage1S: any): number[] | null => {
        if (!Array.isArray(targetDamage1S) || targetDamage1S.length === 0) return null;
        const first = targetDamage1S[0];
        if (!Array.isArray(first)) return null;
        // Shape A: [phase][target][time]
        if (Array.isArray(first[0]) && Array.isArray(first[0][0])) {
            return sumCumulativeTargets(first);
        }
        // Shape B: [target][phase][time]
        if (Array.isArray(first[0]) && !Array.isArray(first[0][0])) {
            const phaseSeries = targetDamage1S
                .map((target: any) => Array.isArray(target) && Array.isArray(target[0]) ? target[0].map((v: any) => Number(v || 0)) : null)
                .filter((s: number[] | null): s is number[] => Array.isArray(s) && s.length > 0);
            if (phaseSeries.length > 0) return sumCumulativeTargets(phaseSeries);
        }
        return null;
    };

    const targetPhase0 = extractTargetPhase0(player?.targetDamage1S);
    const totalPhase0 = Array.isArray(player?.damage1S) && Array.isArray(player.damage1S[0])
        ? player.damage1S[0]
        : null;

    const cumulative = targetPhase0
        ? targetPhase0
        : (Array.isArray(totalPhase0) ? totalPhase0.map((v: any) => Number(v || 0)) : []);

    return toPerSecond(cumulative);
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

function extractSkillRows(player: any, details: any): AllDamagePlayerBucket['skillRows'] {
    const skillMap = details?.skillMap || {};
    const buffMap = details?.buffMap || {};
    const resolveSkillName = (rawId: any): { name: string; icon?: string } => {
        const idNum = Number(rawId);
        if (!Number.isFinite(idNum)) return { name: String(rawId || 'Unknown Skill') };
        const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
        if (mapped?.name) return { name: String(mapped.name), icon: mapped?.icon };
        const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
        if (buffMapped?.name) return { name: String(buffMapped.name), icon: buffMapped?.icon };
        return { name: `Skill ${idNum}` };
    };

    const skillAgg = new Map<number, { skillName: string; damage: number; downContribution: number; hits: number; icon?: string }>();
    const consume = (entry: any) => {
        if (!entry || typeof entry !== 'object') return;
        if (entry.indirectDamage) return;
        const id = Number(entry.id);
        if (!Number.isFinite(id)) return;
        const damage = Number(entry.totalDamage || 0);
        const downContribution = Number(entry.downContribution || 0);
        const hits = Number(entry.hits || 0);
        if (damage <= 0 && downContribution <= 0) return;
        const existing = skillAgg.get(id);
        if (existing) {
            existing.damage += damage;
            existing.downContribution += downContribution;
            existing.hits += hits;
        } else {
            const meta = resolveSkillName(id);
            skillAgg.set(id, { skillName: meta.name, damage, downContribution, hits, icon: meta.icon });
        }
    };

    if (Array.isArray(player?.targetDamageDist)) {
        player.targetDamageDist.forEach((targetGroup: any) => {
            if (!Array.isArray(targetGroup)) return;
            targetGroup.forEach((list: any) => {
                if (!Array.isArray(list)) return;
                list.forEach(consume);
            });
        });
    } else if (Array.isArray(player?.totalDamageDist)) {
        player.totalDamageDist.forEach((list: any) => {
            if (!Array.isArray(list)) return;
            list.forEach(consume);
        });
    }

    return Array.from(skillAgg.values())
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
    const players = Array.isArray(details.players) ? details.players : [];

    const fightPlayers: AllDamagePlayerBucket[] = [];
    let fightTotalDamage = 0;
    let fightTotalDown = 0;

    players.forEach((player: any) => {
        if (player?.notInSquad) return;
        const account = String(player?.account || player?.name || 'Unknown');
        const characterName = String(player?.character_name || player?.display_name || player?.name || '');
        const profession = String(player?.profession || 'Unknown');
        const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;

        const perSecond = extractPerSecondDamage(player);
        const durationBuckets = Math.max(0, Math.ceil(durationMs / 5000));
        const damageBuckets = Math.max(0, Math.ceil(perSecond.length / 5));
        const bucketCount = Math.max(durationBuckets, damageBuckets);
        const rawBuckets = getBuckets(perSecond, 5);
        const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));

        // Compute per-player damage total from dpsAll or sum of perSecond
        const totalDamage = Number(player?.dpsAll?.[0]?.damage || 0) || perSecond.reduce((sum, v) => sum + v, 0);
        const totalDownContribution = Number(player?.dpsAll?.[0]?.downContribution || 0)
            || Number(player?.statsAll?.[0]?.downContribution || 0)
            || 0;

        // Down contribution 5s buckets (proportional)
        const downRatio = totalDamage > 0 ? Math.min(1, Math.max(0, totalDownContribution / totalDamage)) : 0;
        const buckets5sDown = buckets5s.map((v) => Math.round(v * downRatio));

        const skillRows = extractSkillRows(player, details);

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

        // Aggregate player totals
        const existing = acc.playerAgg.get(key);
        if (existing) {
            existing.logs += 1;
            existing.totalDamage += totalDamage;
            existing.totalDownContribution += totalDownContribution;
            if (!existing.professionList.includes(profession) && profession !== 'Unknown') {
                existing.professionList.push(profession);
            }
        } else {
            acc.playerAgg.set(key, {
                key,
                account,
                displayName: characterName || account,
                profession,
                professionList: [profession].filter((p) => p !== 'Unknown'),
                logs: 1,
                totalDamage,
                totalDownContribution,
            });
        }
    });

    // Sort players within fight by total damage descending
    fightPlayers.sort((a, b) => b.totalDamage - a.totalDamage);

    acc.fights.push({
        id: String(log?.filePath || log?.id || `fight-${index + 1}`),
        shortLabel: `F${index + 1}`,
        fullLabel,
        timestamp: resolveFightTimestamp(details, log),
        totalDamage: fightTotalDamage,
        totalDownContribution: fightTotalDown,
        durationMs,
        players: fightPlayers,
    });
}

export function finalizeAllDamage(acc: AllDamageAccumulator): AllDamageData {
    const players = Array.from(acc.playerAgg.values()).sort((a, b) => b.totalDamage - a.totalDamage);
    return { fights: acc.fights, players };
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
