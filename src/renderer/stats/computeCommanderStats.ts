import { PROFESSION_COLORS } from '../../shared/professionUtils';
import { resolveConditionNameFromEntry } from '../../shared/conditionsMetrics';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { resolveMapName } from './utils/labelUtils';
import { formatDurationMs } from './utils/dashboardUtils';

const knownProfessionNames = new Set(Object.keys(PROFESSION_COLORS));
const knownProfessionList = Object.keys(PROFESSION_COLORS)
    .filter((name) => name && name !== 'Unknown')
    .sort((a, b) => b.length - a.length);
const baseProfessionNames = [
    'Guardian',
    'Revenant',
    'Warrior',
    'Engineer',
    'Ranger',
    'Thief',
    'Elementalist',
    'Mesmer',
    'Necromancer'
];
const resolveProfessionLabel = (name?: string) => {
    if (!name) return 'Unknown';
    const cleaned = String(name)
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/\s*\[[^\]]*\]\s*$/, '')
        .replace(/\s\d+$/, '')
        .trim();
    if (knownProfessionNames.has(cleaned)) return cleaned;
    const lower = cleaned.toLowerCase();
    for (const prof of knownProfessionList) {
        if (lower.includes(prof.toLowerCase())) return prof;
    }
    const baseMatch = baseProfessionNames.find((prof) => lower.includes(prof.toLowerCase()));
    return baseMatch || cleaned || 'Unknown';
};

const isBoon = (meta?: { classification?: string }) => {
    if (!meta?.classification) return true;
    return meta.classification === 'Boon';
};

const getFightDownsDeaths = (details: any) => {
    const players = details?.players || [];
    const squadPlayers = players.filter((p: any) => !p.notInSquad);
    let squadDownsDeaths = 0;
    let enemyDownsDeaths = 0;
    let squadDeaths = 0;
    let enemyDeaths = 0;
    squadPlayers.forEach((p: any) => {
        const defenses = p.defenses?.[0];
        if (!defenses) return;
        const downCount = Number(defenses.downCount || 0);
        const deadCount = Number(defenses.deadCount || 0);
        squadDownsDeaths += downCount + deadCount;
        squadDeaths += deadCount;
    });
    squadPlayers.forEach((p: any) => {
        if (!p.statsTargets || p.statsTargets.length === 0) return;
        p.statsTargets.forEach((targetStats: any) => {
            if (!Array.isArray(targetStats)) return;
            targetStats.forEach((phaseStats: any) => {
                if (!phaseStats) return;
                const downed = Number(phaseStats.downed || 0);
                const killed = Number(phaseStats.killed || 0);
                enemyDownsDeaths += downed + killed;
                enemyDeaths += killed;
            });
        });
    });
    return { squadDownsDeaths, enemyDownsDeaths, squadDeaths, enemyDeaths };
};

const getFightOutcome = (details: any) => {
    const { squadDownsDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
    if (squadDownsDeaths > 0 || enemyDownsDeaths > 0) {
        return enemyDownsDeaths > squadDownsDeaths;
    }
    if (typeof details?.success === 'boolean') return details.success;
    return false;
};

export function computeCommanderStats(sortedFightLogsWithDetails: any[]) {
const parseCommanderBoonUptime = (player: any, buffMap: Record<string, any>) => {
    const uptimes = Array.isArray(player?.buffUptimes) ? player.buffUptimes : [];
    let weightedPercent = 0;
    let boonCount = 0;
    uptimes.forEach((buff: any) => {
        if (typeof buff?.id !== 'number') return;
        const meta = buffMap?.[`b${buff.id}`] || buffMap?.[String(buff.id)];
        if (!isBoon(meta)) return;
        const stacking = Boolean(meta?.stacking);
        const uptime = Number(buff?.buffData?.[0]?.uptime ?? 0);
        const presence = Number(buff?.buffData?.[0]?.presence ?? 0);
        const raw = stacking ? presence : uptime;
        if (!Number.isFinite(raw) || raw <= 0) return;
        weightedPercent += Math.min(Math.max(raw, 0), 100);
        boonCount += 1;
    });
    return {
        boonCount,
        boonUptimePct: boonCount > 0 ? weightedPercent / boonCount : 0
    };
};
const asRatePerMinute = (value: number, durationMs: number) => {
    if (!Number.isFinite(value)) return 0;
    const minutes = Math.max(1 / 60, Number(durationMs || 0) / 60000);
    return value / minutes;
};
const resolveSkillMeta = (entry: any, skillMap: Record<string, any>, buffMap: Record<string, any>) => {
    let name = `Skill ${entry?.id}`;
    const mapped = skillMap?.[`s${entry?.id}`] || skillMap?.[`${entry?.id}`];
    let icon = mapped?.icon;
    if (mapped?.name) name = mapped.name;
    if (name.startsWith('Skill ')) {
        const conditionName = resolveConditionNameFromEntry(name, entry?.id, buffMap);
        if (conditionName) {
            name = conditionName;
            icon = buffMap?.[`b${entry?.id}`]?.icon || icon;
        }
    }
    return { name, icon };
};
const flattenDamageTakenRows = (totalDamageTaken: any) => {
    if (!Array.isArray(totalDamageTaken)) return [] as any[];
    const rows: any[] = [];
    totalDamageTaken.forEach((group: any) => {
        if (!Array.isArray(group)) return;
        group.forEach((entry: any) => {
            if (!entry || typeof entry !== 'object') return;
            rows.push(entry);
        });
    });
    return rows;
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
const sampleBoonStatesTo5s = (
    statesPerSource: Record<string, any>,
    bucketCount: number,
    stacking: boolean,
    boonName: string
) => {
    const buckets = Array.from({ length: bucketCount }, () => 0);
    if (!statesPerSource || typeof statesPerSource !== 'object' || bucketCount <= 0) return buckets;
    Object.values(statesPerSource).forEach((states: any) => {
        const normalized = normalizeStatePairs(states);
        if (normalized.length === 0) return;
        let stateIndex = 0;
        let currentValue = 0;
        for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
            const sampleTime = bucketIndex * 5000;
            while (stateIndex < normalized.length && normalized[stateIndex][0] <= sampleTime) {
                currentValue = Math.max(0, Number(normalized[stateIndex][1] || 0));
                stateIndex += 1;
            }
            buckets[bucketIndex] += Math.max(0, Number(currentValue || 0));
        }
    });
    const stackCap = resolveBoonStackCap(boonName, stacking);
    return buckets.map((value) => {
        if (!stacking) return value > 0 ? 100 : 0;
        const clipped = Math.max(0, Math.min(stackCap, Math.round(value)));
        return (clipped / Math.max(1, stackCap)) * 100;
    });
};
const extractCumulativeSeries = (input: any): number[] => {
    if (!Array.isArray(input) || input.length === 0) return [];
    if (typeof input[0] === 'number') {
        return input.map((value: any) => Number(value || 0));
    }
    if (Array.isArray(input[0]) && typeof input[0][0] === 'number') {
        return input[0].map((value: any) => Number(value || 0));
    }
    return [];
};
const toPerSecond = (cumulative: number[]) => {
    if (!Array.isArray(cumulative) || cumulative.length === 0) return [] as number[];
    const deltas: number[] = [];
    for (let i = 0; i < cumulative.length; i += 1) {
        const current = Number(cumulative[i] || 0);
        const prev = i > 0 ? Number(cumulative[i - 1] || 0) : 0;
        deltas.push(Math.max(0, current - prev));
    }
    return deltas;
};
const bucket5s = (perSecond: number[], bucketCount: number) => {
    return Array.from({ length: bucketCount }, (_, bucketIdx) => {
        const start = bucketIdx * 5;
        let sum = 0;
        for (let i = 0; i < 5; i += 1) {
            sum += Number(perSecond[start + i] || 0);
        }
        return sum;
    });
};
const collectIncomingSkillRows = (
    totalDamageTaken: any,
    skillMap: Record<string, any>,
    buffMap: Record<string, any>
) => {
    const rowsMap = new Map<string, { id: string; name: string; icon?: string; damage: number; hits: number }>();
    flattenDamageTakenRows(totalDamageTaken).forEach((entry: any) => {
        if (!entry?.id) return;
        const { name, icon } = resolveSkillMeta(entry, skillMap, buffMap);
        const key = `s${entry.id}`;
        const row = rowsMap.get(key) || { id: key, name, icon, damage: 0, hits: 0 };
        row.damage += Math.max(0, Number(entry?.totalDamage || 0));
        row.hits += Math.max(0, Number(entry?.hits || entry?.connectedHits || 0));
        if (row.name.startsWith('Skill ') && !name.startsWith('Skill ')) row.name = name;
        if (!row.icon && icon) row.icon = icon;
        rowsMap.set(key, row);
    });
    return Array.from(rowsMap.values())
        .sort((a, b) => b.damage - a.damage || b.hits - a.hits || a.name.localeCompare(b.name));
};
const collectIncomingBoonRows = (player: any, buffMap: Record<string, any>, durationMs: number) => {
    const rowsMap = new Map<string, {
        id: string;
        name: string;
        icon?: string;
        stacking: boolean;
        uptimePct: number;
        uptimeMs: number;
        buckets5s: number[];
    }>();
    const buffUptimes = Array.isArray(player?.buffUptimes) ? player.buffUptimes : [];
    buffUptimes.forEach((buff: any) => {
        const boonIdNum = Number(buff?.id);
        if (!Number.isFinite(boonIdNum)) return;
        const boonId = `b${boonIdNum}`;
        const meta = buffMap?.[boonId] || buffMap?.[String(boonIdNum)] || {};
        if (!isBoon(meta)) return;
        const stacking = Boolean(meta?.stacking);
        const uptime = Number(buff?.buffData?.[0]?.uptime ?? 0);
        const presence = Number(buff?.buffData?.[0]?.presence ?? 0);
        const rawPct = Math.min(100, Math.max(0, stacking ? presence : uptime));
        if (!Number.isFinite(rawPct) || rawPct <= 0) return;
        const row = rowsMap.get(boonId) || {
            id: boonId,
            name: String(meta?.name || boonId),
            icon: meta?.icon,
            stacking,
            uptimePct: 0,
            uptimeMs: 0,
            buckets5s: []
        };
        row.uptimePct = Math.max(row.uptimePct, rawPct);
        row.uptimeMs += (rawPct / 100) * Math.max(0, Number(durationMs || 0));
        const statesPerSource = (buff?.statesPerSource && typeof buff.statesPerSource === 'object')
            ? buff.statesPerSource as Record<string, any>
            : null;
        if (statesPerSource) {
            row.buckets5s = sampleBoonStatesTo5s(
                statesPerSource,
                Math.max(1, Math.ceil(Math.max(1, Number(durationMs || 0)) / 5000)),
                Boolean(meta?.stacking),
                String(meta?.name || '')
            );
        }
        if (!row.icon && meta?.icon) row.icon = meta.icon;
        rowsMap.set(boonId, row);
    });
    return Array.from(rowsMap.values())
        .sort((a, b) => b.uptimePct - a.uptimePct || b.uptimeMs - a.uptimeMs || a.name.localeCompare(b.name));
};

const commanders = new Map<string, {
    key: string;
    account: string;
    characterNames: Set<string>;
    primaryProfession: string;
    professionTimeMs: Record<string, number>;
    fights: number;
    wins: number;
    losses: number;
    totalDurationMs: number;
    totalSquadCount: number;
    totalEnemyCount: number;
    totalKills: number;
    totalDowns: number;
    totalCommanderDowns: number;
    totalCommanderDeaths: number;
    totalAlliesDown: number;
    totalAlliesDead: number;
    totalDamageTaken: number;
    totalIncomingBarrierAbsorbed: number;
    totalIncomingStrips: number;
    totalIncomingCC: number;
    boonWeightedPctMs: number;
    boonDurationMs: number;
    boonEntriesSeen: number;
    incomingSkillMap: Map<string, { id: string; name: string; icon?: string; damage: number; hits: number }>;
    incomingBoonMap: Map<string, { id: string; name: string; icon?: string; uptimePctWeightedMs: number; durationMs: number; stacking: boolean }>;
    fightRows: Array<{
        id: string;
        shortLabel: string;
        fullLabel: string;
        timestamp: number;
        mapName: string;
        durationMs: number;
        duration: string;
        isWin: boolean;
        squadCount: number;
        enemyCount: number;
        kills: number;
        downs: number;
        commanderDowns: number;
        commanderDeaths: number;
        alliesDown: number;
        alliesDead: number;
        damageTaken: number;
        damageTakenPerMinute: number;
        incomingBarrierAbsorbed: number;
        incomingBarrierAbsorbedPerMinute: number;
        incomingStrips: number;
        incomingStripsPerMinute: number;
        incomingCC: number;
        incomingCCPerMinute: number;
        timeToFirstEnemyDownMs: number | null;
        timeToFirstEnemyDeathMs: number | null;
        downToKillConversionMs: number | null;
        hadEarlyDown: boolean | null;
        wasStalledPush: boolean | null;
        downToKillConversionPct: number | null;
        failedDownEstimate: number;
        distanceTraveled: number | null;
        movementPerMinute: number | null;
        stationaryPct: number | null;
        movementBurstCount: number | null;
        commanderDiedAtMs: number | null;
        squadDeathsAfterTagDeath: number | null;
        enemyKillsAfterTagDeath: number | null;
        collapsedAfterTagDeath: boolean | null;
        recoveredAfterTagDeath: boolean | null;
        boonUptimePct: number;
        boonEntries: number;
        incomingDamageBySkill: Array<{ id: string; name: string; icon?: string; damage: number; hits: number }>;
        incomingBoonUptimes: Array<{ id: string; name: string; icon?: string; stacking: boolean; uptimePct: number; uptimeMs: number; buckets5s: number[] }>;
        incomingDamageBuckets5s: number[];
        incomingBoonBuckets5s: number[];
    }>;
}>();
const EARLY_PUSH_WINDOW_MS = 15_000;
const STALLED_PUSH_WINDOW_MS = 15_000;
const toReplayPairs = (value: any): Array<[number, number]> => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry: any) => (Array.isArray(entry) ? [Number(entry[0]), Number(entry[1])] as [number, number] : null))
        .filter((entry: [number, number] | null): entry is [number, number] => !!entry && Number.isFinite(entry[0]));
};
const getReplayTimes = (entity: any, key: 'down' | 'dead') => {
    const replay = entity?.combatReplayData;
    const segments = Array.isArray(replay) ? replay : (replay ? [replay] : []);
    return segments
        .flatMap((segment: any) => toReplayPairs(segment?.[key]).map(([time]) => Number(time || 0)))
        .filter((value: number) => Number.isFinite(value) && value >= 0);
};
const getFirstReplayTime = (entities: any[], key: 'down' | 'dead') => {
    if (!Array.isArray(entities) || entities.length === 0) return null;
    const times = entities.flatMap((entity: any) => getReplayTimes(entity, key));
    if (times.length === 0) return null;
    return Math.min(...times);
};
const averageDefined = (values: Array<number | null | undefined>) => {
    const filtered = values.filter((value): value is number => (
        typeof value === 'number' && Number.isFinite(value)
    ));
    if (filtered.length === 0) return null;
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
};
const percentFromFlags = (values: Array<boolean | null | undefined>) => {
    const filtered = values.filter((value): value is boolean => typeof value === 'boolean');
    if (filtered.length === 0) return null;
    const positive = filtered.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    return (positive / filtered.length) * 100;
};
const extractReplayPositionPairs = (value: any): Array<[number, number]> => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry: any) => (Array.isArray(entry) ? [Number(entry[0]), Number(entry[1])] as [number, number] : null))
        .filter((entry: [number, number] | null): entry is [number, number] => (
            !!entry && Number.isFinite(entry[0]) && Number.isFinite(entry[1])
        ));
};
const computeMovementMetrics = (combatReplayData: any, durationMs: number, inchToPixel: number) => {
    const segments = Array.isArray(combatReplayData) ? combatReplayData : (combatReplayData ? [combatReplayData] : []);
    const positions = segments.flatMap((segment: any) => extractReplayPositionPairs(segment?.positions));
    if (positions.length < 2) {
        return {
            distanceTraveled: null,
            movementPerMinute: null,
            stationaryPct: null,
            movementBurstCount: null
        };
    }
    const scale = Number.isFinite(inchToPixel) && inchToPixel > 0 ? inchToPixel : 1;
    const stationaryThreshold = 1;
    const burstThreshold = 25;
    let totalDistance = 0;
    let stationarySegments = 0;
    let movementBurstCount = 0;
    let inBurst = false;
    let segmentCount = 0;
    for (let i = 1; i < positions.length; i += 1) {
        const [prevX, prevY] = positions[i - 1];
        const [nextX, nextY] = positions[i];
        const distance = Math.hypot(nextX - prevX, nextY - prevY) / scale;
        if (!Number.isFinite(distance)) continue;
        segmentCount += 1;
        totalDistance += Math.max(0, distance);
        if (distance <= stationaryThreshold) {
            stationarySegments += 1;
            inBurst = false;
        } else if (distance > burstThreshold) {
            if (!inBurst) movementBurstCount += 1;
            inBurst = true;
        }
    }
    if (segmentCount === 0) {
        return {
            distanceTraveled: null,
            movementPerMinute: null,
            stationaryPct: null,
            movementBurstCount: null
        };
    }
    return {
        distanceTraveled: totalDistance,
        movementPerMinute: asRatePerMinute(totalDistance, durationMs),
        stationaryPct: (stationarySegments / segmentCount) * 100,
        movementBurstCount
    };
};

sortedFightLogsWithDetails.forEach(({ log }, idx) => {
    const details = log?.details;
    if (!details) return;
    const players = Array.isArray(details?.players) ? details.players : [];
    const squadPlayers = players.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return;

    const commanderCandidates = squadPlayers.filter((p: any) => Boolean(p?.hasCommanderTag));
    if (commanderCandidates.length === 0) return;
    const commander = [...commanderCandidates].sort((a: any, b: any) => {
        const aActive = Array.isArray(a?.activeTimes) ? Number(a.activeTimes[0] || 0) : 0;
        const bActive = Array.isArray(b?.activeTimes) ? Number(b.activeTimes[0] || 0) : 0;
        if (bActive !== aActive) return bActive - aActive;
        return String(a?.account || a?.name || '').localeCompare(String(b?.account || b?.name || ''));
    })[0];
    if (!commander) return;

    const account = String(commander?.account || commander?.name || `Commander ${idx + 1}`);
    const characterName = String(commander?.name || '');
    const profession = resolveProfessionLabel(commander?.profession || commander?.name || 'Unknown');
    const durationMs = Math.max(0, Number(details?.durationMS || 0));
    const replayMeta = (details?.combatReplayMetaData && typeof details.combatReplayMetaData === 'object')
        ? details.combatReplayMetaData
        : {};
    const inchToPixel = Number(replayMeta?.inchToPixel || 0) > 0
        ? Number(replayMeta.inchToPixel)
        : 1;
    const timestamp = resolveFightTimestamp(details, log);
    const mapName = resolveMapName(details, log);
    const squadCount = squadPlayers.length;
    const enemyCount = Array.isArray(details?.targets)
        ? details.targets.filter((target: any) => !target?.isFake).length
        : 0;
    const commanderDef = commander?.defenses?.[0] || {};
    const commanderDowns = Math.max(0, Number(commanderDef?.downCount || 0));
    const commanderDeaths = Math.max(0, Number(commanderDef?.deadCount || 0));
    const damageTaken = Math.max(0, Number(commanderDef?.damageTaken || 0));
    const incomingBarrierAbsorbed = Math.max(0, Number(commanderDef?.damageBarrier || 0));
    const incomingStrips = Math.max(0, Number(commanderDef?.boonStrips || 0));
    const incomingCC = Math.max(0, Number(commanderDef?.receivedCrowdControl || 0));
    const summary = log?.dashboardSummary && typeof log.dashboardSummary === 'object'
        ? log.dashboardSummary
        : null;
    const enemyTargets = Array.isArray(details?.targets)
        ? details.targets.filter((target: any) => !target?.isFake)
        : [];
    const enemyTargetsPresent = Array.isArray(details?.targets)
        ? details.targets.some((target: any) => !target?.isFake)
        : false;
    const { enemyDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
    const kills = enemyTargetsPresent || squadPlayers.length > 0
        ? enemyDeaths
        : Math.max(0, Number(summary?.enemyDeaths || 0));
    const downs = enemyTargetsPresent || squadPlayers.length > 0
        ? Math.max(0, enemyDownsDeaths - enemyDeaths)
        : Math.max(0, Number(summary?.enemyDowns || 0));
    const timeToFirstEnemyDownMs = getFirstReplayTime(enemyTargets, 'down');
    const timeToFirstEnemyDeathMs = getFirstReplayTime(enemyTargets, 'dead');
    const commanderDiedAtMs = getFirstReplayTime([commander], 'dead');
    const squadDeathTimes = squadPlayers.flatMap((player: any) => getReplayTimes(player, 'dead'));
    const enemyDeathTimes = enemyTargets.flatMap((target: any) => getReplayTimes(target, 'dead'));
    const squadDeathsAfterTagDeath = commanderDiedAtMs !== null
        ? squadDeathTimes.filter((time: number) => time > commanderDiedAtMs).length
        : null;
    const enemyKillsAfterTagDeath = commanderDiedAtMs !== null
        ? (enemyDeathTimes.length > 0
            ? enemyDeathTimes.filter((time: number) => time > commanderDiedAtMs).length
            : null)
        : null;
    const downToKillConversionMs = timeToFirstEnemyDownMs !== null
        && timeToFirstEnemyDeathMs !== null
        && timeToFirstEnemyDeathMs >= timeToFirstEnemyDownMs
        ? timeToFirstEnemyDeathMs - timeToFirstEnemyDownMs
        : null;
    const downToKillConversionPct = downs > 0
        ? (kills / downs) * 100
        : null;
    const failedDownEstimate = Math.max(0, downs - kills);
    const hadEarlyDown = timeToFirstEnemyDownMs !== null
        ? timeToFirstEnemyDownMs <= EARLY_PUSH_WINDOW_MS
        : null;
    const wasStalledPush = timeToFirstEnemyDownMs !== null
        ? (timeToFirstEnemyDeathMs === null
            || (timeToFirstEnemyDeathMs - timeToFirstEnemyDownMs) > STALLED_PUSH_WINDOW_MS)
        : null;
    const collapsedAfterTagDeath = commanderDiedAtMs !== null
        ? (
            squadDeathsAfterTagDeath !== null
            && enemyKillsAfterTagDeath !== null
            ? squadDeathsAfterTagDeath > enemyKillsAfterTagDeath
            : null
        )
        : null;
    const recoveredAfterTagDeath = commanderDiedAtMs !== null
        ? (
            squadDeathsAfterTagDeath !== null
            && enemyKillsAfterTagDeath !== null
            ? enemyKillsAfterTagDeath > 0 && enemyKillsAfterTagDeath >= squadDeathsAfterTagDeath
            : null
        )
        : null;
    const alliesDown = squadPlayers.reduce((sum: number, p: any) => sum + Math.max(0, Number(p?.defenses?.[0]?.downCount || 0)), 0);
    const alliesDead = squadPlayers.reduce((sum: number, p: any) => sum + Math.max(0, Number(p?.defenses?.[0]?.deadCount || 0)), 0);
    const buffMap = details?.buffMap && typeof details?.buffMap === 'object' ? details.buffMap : {};
    const skillMap = details?.skillMap && typeof details?.skillMap === 'object' ? details.skillMap : {};
    const { boonCount, boonUptimePct } = parseCommanderBoonUptime(commander, buffMap);
    const incomingDamageBySkill = collectIncomingSkillRows(commander?.totalDamageTaken, skillMap, buffMap);
    const incomingBoonUptimes = collectIncomingBoonRows(commander, buffMap, durationMs);
    const movementMetrics = computeMovementMetrics(commander?.combatReplayData, durationMs, inchToPixel);
    const bucketCount = Math.max(1, Math.ceil(Math.max(1, durationMs) / 5000));
    const incomingDamageCumulative = extractCumulativeSeries(commander?.powerDamageTaken1S);
    const incomingDamagePerSecond = toPerSecond(incomingDamageCumulative);
    const incomingDamageBuckets5s = bucket5s(incomingDamagePerSecond, bucketCount);
    const incomingBoonBuckets5s = (() => {
        const allBuffBuckets = incomingBoonUptimes
            .map((row: any) => Array.isArray(row?.buckets5s) ? row.buckets5s : [])
            .filter((buckets: number[]) => buckets.length > 0);
        if (allBuffBuckets.length === 0) {
            return Array.from({ length: bucketCount }, () => boonUptimePct);
        }
        return Array.from({ length: bucketCount }, (_, idx) => {
            const sum = allBuffBuckets.reduce((acc, buckets) => acc + Number(buckets[idx] || 0), 0);
            return sum / allBuffBuckets.length;
        });
    })();
    const isWin = getFightOutcome(details);
    const key = account;

    if (!commanders.has(key)) {
        commanders.set(key, {
            key,
            account,
            characterNames: new Set<string>(),
            primaryProfession: profession,
            professionTimeMs: {},
            fights: 0,
            wins: 0,
            losses: 0,
            totalDurationMs: 0,
            totalSquadCount: 0,
            totalEnemyCount: 0,
            totalKills: 0,
            totalDowns: 0,
            totalCommanderDowns: 0,
            totalCommanderDeaths: 0,
            totalAlliesDown: 0,
            totalAlliesDead: 0,
            totalDamageTaken: 0,
            totalIncomingBarrierAbsorbed: 0,
            totalIncomingStrips: 0,
            totalIncomingCC: 0,
            boonWeightedPctMs: 0,
            boonDurationMs: 0,
            boonEntriesSeen: 0,
            incomingSkillMap: new Map(),
            incomingBoonMap: new Map(),
            fightRows: []
        });
    }
    const row = commanders.get(key)!;
    if (characterName) row.characterNames.add(characterName);
    const activeMs = Array.isArray(commander?.activeTimes) && typeof commander.activeTimes[0] === 'number'
        ? Math.max(0, Number(commander.activeTimes[0] || 0))
        : durationMs;
    row.professionTimeMs[profession] = (row.professionTimeMs[profession] || 0) + activeMs;
    row.fights += 1;
    row.wins += isWin ? 1 : 0;
    row.losses += isWin ? 0 : 1;
    row.totalDurationMs += durationMs;
    row.totalSquadCount += squadCount;
    row.totalEnemyCount += enemyCount;
    row.totalKills += kills;
    row.totalDowns += downs;
    row.totalCommanderDowns += commanderDowns;
    row.totalCommanderDeaths += commanderDeaths;
    row.totalAlliesDown += alliesDown;
    row.totalAlliesDead += alliesDead;
    row.totalDamageTaken += damageTaken;
    row.totalIncomingBarrierAbsorbed += incomingBarrierAbsorbed;
    row.totalIncomingStrips += incomingStrips;
    row.totalIncomingCC += incomingCC;
    row.boonWeightedPctMs += boonUptimePct * durationMs;
    row.boonDurationMs += durationMs;
    row.boonEntriesSeen += boonCount;
    incomingDamageBySkill.forEach((skillRow) => {
        const existing = row.incomingSkillMap.get(skillRow.id) || { ...skillRow, damage: 0, hits: 0 };
        existing.damage += Number(skillRow.damage || 0);
        existing.hits += Number(skillRow.hits || 0);
        if (existing.name.startsWith('Skill ') && !skillRow.name.startsWith('Skill ')) existing.name = skillRow.name;
        if (!existing.icon && skillRow.icon) existing.icon = skillRow.icon;
        row.incomingSkillMap.set(skillRow.id, existing);
    });
    incomingBoonUptimes.forEach((boonRow) => {
        const existing = row.incomingBoonMap.get(boonRow.id) || {
            id: boonRow.id,
            name: boonRow.name,
            icon: boonRow.icon,
            stacking: boonRow.stacking,
            uptimePctWeightedMs: 0,
            durationMs: 0
        };
        existing.uptimePctWeightedMs += Number(boonRow.uptimePct || 0) * durationMs;
        existing.durationMs += durationMs;
        if (!existing.icon && boonRow.icon) existing.icon = boonRow.icon;
        row.incomingBoonMap.set(boonRow.id, existing);
    });

    row.fightRows.push({
        id: String(log?.filePath || log?.id || `fight-${idx + 1}`),
        shortLabel: `F${idx + 1}`,
        fullLabel: `${mapName || (log?.encounterName || 'Unknown Map')} • ${formatDurationMs(durationMs)}`,
        timestamp,
        mapName,
        durationMs,
        duration: formatDurationMs(durationMs),
        isWin,
        squadCount,
        enemyCount,
        kills,
        downs,
        commanderDowns,
        commanderDeaths,
        alliesDown,
        alliesDead,
        damageTaken,
        damageTakenPerMinute: asRatePerMinute(damageTaken, durationMs),
        incomingBarrierAbsorbed,
        incomingBarrierAbsorbedPerMinute: asRatePerMinute(incomingBarrierAbsorbed, durationMs),
        incomingStrips,
        incomingStripsPerMinute: asRatePerMinute(incomingStrips, durationMs),
        incomingCC,
        incomingCCPerMinute: asRatePerMinute(incomingCC, durationMs),
        timeToFirstEnemyDownMs,
        timeToFirstEnemyDeathMs,
        downToKillConversionMs,
        hadEarlyDown,
        wasStalledPush,
        downToKillConversionPct,
        failedDownEstimate,
        distanceTraveled: movementMetrics.distanceTraveled,
        movementPerMinute: movementMetrics.movementPerMinute,
        stationaryPct: movementMetrics.stationaryPct,
        movementBurstCount: movementMetrics.movementBurstCount,
        commanderDiedAtMs,
        squadDeathsAfterTagDeath,
        enemyKillsAfterTagDeath,
        collapsedAfterTagDeath,
        recoveredAfterTagDeath,
        boonUptimePct,
        boonEntries: boonCount,
        incomingDamageBySkill,
        incomingBoonUptimes,
        incomingDamageBuckets5s,
        incomingBoonBuckets5s
    });
});

const rows = Array.from(commanders.values())
    .map((entry) => {
        const professions = Object.keys(entry.professionTimeMs)
            .filter((name) => name && name !== 'Unknown')
            .sort((a, b) => (entry.professionTimeMs[b] || 0) - (entry.professionTimeMs[a] || 0));
        const primaryProfession = professions[0] || entry.primaryProfession || 'Unknown';
        const weightedBoonUptimePct = entry.boonDurationMs > 0
            ? entry.boonWeightedPctMs / entry.boonDurationMs
            : 0;
        const kdr = entry.totalAlliesDead > 0
            ? entry.totalKills / entry.totalAlliesDead
            : entry.totalKills;
        const totalMinutes = Math.max(1 / 60, entry.totalDurationMs / 60000);
        const fights = [...entry.fightRows].sort((a, b) => {
            if (a.timestamp > 0 && b.timestamp > 0 && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            return a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true });
        });
        const avgTimeToFirstEnemyDownMs = averageDefined(fights.map((fight) => fight.timeToFirstEnemyDownMs));
        const avgTimeToFirstEnemyDeathMs = averageDefined(fights.map((fight) => fight.timeToFirstEnemyDeathMs));
        const avgDownToKillConversionMs = averageDefined(fights.map((fight) => fight.downToKillConversionMs));
        const pushesWithEarlyDownPct = percentFromFlags(fights.map((fight) => fight.hadEarlyDown));
        const stalledPushPct = percentFromFlags(fights.map((fight) => fight.wasStalledPush));
        const downToKillConversionPct = entry.totalDowns > 0
            ? (entry.totalKills / entry.totalDowns) * 100
            : null;
        const avgKillsPerFight = entry.fights > 0 ? entry.totalKills / entry.fights : null;
        const avgDownsPerFight = entry.fights > 0 ? entry.totalDowns / entry.fights : null;
        const failedDownEstimate = Math.max(0, entry.totalDowns - entry.totalKills);
        const avgCommanderDistanceTraveled = averageDefined(fights.map((fight) => fight.distanceTraveled));
        const avgCommanderMovementPerMinute = averageDefined(fights.map((fight) => fight.movementPerMinute));
        const avgTagStationaryPct = averageDefined(fights.map((fight) => fight.stationaryPct));
        const avgTagMovementBurstCount = averageDefined(fights.map((fight) => fight.movementBurstCount));
        const fightsWithCommanderDeath = fights.filter((fight) => fight.commanderDiedAtMs !== null).length;
        const deathFights = fights.filter((fight) => fight.commanderDiedAtMs !== null);
        const avgSquadDeathsAfterTagDeath = averageDefined(deathFights.map((fight) => fight.squadDeathsAfterTagDeath));
        const avgEnemyKillsAfterTagDeath = averageDefined(deathFights.map((fight) => fight.enemyKillsAfterTagDeath));
        const squadCollapseAfterTagDeathPct = percentFromFlags(deathFights.map((fight) => fight.collapsedAfterTagDeath));
        const recoveryAfterTagDeathPct = percentFromFlags(deathFights.map((fight) => fight.recoveredAfterTagDeath));
        return {
            key: entry.key,
            account: entry.account,
            characterNames: Array.from(entry.characterNames.values()).sort((a, b) => a.localeCompare(b)),
            profession: primaryProfession,
            professionList: professions,
            fights: entry.fights,
            wins: entry.wins,
            losses: entry.losses,
            winRatePct: entry.fights > 0 ? (entry.wins / entry.fights) * 100 : 0,
            totalDurationMs: entry.totalDurationMs,
            avgSquadSize: entry.fights > 0 ? entry.totalSquadCount / entry.fights : 0,
            avgEnemySize: entry.fights > 0 ? entry.totalEnemyCount / entry.fights : 0,
            kills: entry.totalKills,
            downs: entry.totalDowns,
            commanderDowns: entry.totalCommanderDowns,
            commanderDeaths: entry.totalCommanderDeaths,
            alliesDown: entry.totalAlliesDown,
            alliesDead: entry.totalAlliesDead,
            kdr,
            damageTaken: entry.totalDamageTaken,
            damageTakenPerMinute: entry.totalDamageTaken / totalMinutes,
            incomingBarrierAbsorbed: entry.totalIncomingBarrierAbsorbed,
            incomingBarrierAbsorbedPerMinute: entry.totalIncomingBarrierAbsorbed / totalMinutes,
            incomingStrips: entry.totalIncomingStrips,
            incomingStripsPerMinute: entry.totalIncomingStrips / totalMinutes,
            incomingCC: entry.totalIncomingCC,
            incomingCCPerMinute: entry.totalIncomingCC / totalMinutes,
            avgTimeToFirstEnemyDownMs,
            avgTimeToFirstEnemyDeathMs,
            avgDownToKillConversionMs,
            pushesWithEarlyDownPct,
            stalledPushPct,
            downToKillConversionPct,
            avgKillsPerFight,
            avgDownsPerFight,
            failedDownEstimate,
            avgCommanderDistanceTraveled,
            avgCommanderMovementPerMinute,
            avgTagStationaryPct,
            avgTagMovementBurstCount,
            fightsWithCommanderDeath,
            avgSquadDeathsAfterTagDeath,
            avgEnemyKillsAfterTagDeath,
            squadCollapseAfterTagDeathPct,
            recoveryAfterTagDeathPct,
            boonUptimePct: weightedBoonUptimePct,
            boonEntries: entry.boonEntriesSeen,
            incomingSkillBreakdown: Array.from(entry.incomingSkillMap.values())
                .sort((a, b) => b.damage - a.damage || b.hits - a.hits || a.name.localeCompare(b.name)),
            incomingBoonBreakdown: Array.from(entry.incomingBoonMap.values())
                .map((boon) => ({
                    id: boon.id,
                    name: boon.name,
                    icon: boon.icon,
                    stacking: boon.stacking,
                    uptimePct: boon.durationMs > 0 ? boon.uptimePctWeightedMs / boon.durationMs : 0
                }))
                .sort((a, b) => b.uptimePct - a.uptimePct || a.name.localeCompare(b.name)),
            fightsData: fights
        };
    })
    .sort((a, b) => {
        const durationDelta = Number(b.totalDurationMs || 0) - Number(a.totalDurationMs || 0);
        if (durationDelta !== 0) return durationDelta;
        const winsDelta = Number(b.wins || 0) - Number(a.wins || 0);
        if (winsDelta !== 0) return winsDelta;
        return String(a.account || '').localeCompare(String(b.account || ''));
    });

return { rows };

}
