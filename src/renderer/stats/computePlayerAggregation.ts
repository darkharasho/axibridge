
import { getPlayerCleanses, getPlayerStrips } from "../../shared/dashboardMetrics";
import { applySquadStabilityGeneration as applyStabilityGeneration, computeDownContribution as getPlayerDownContribution, computeSquadHealing as getPlayerSquadHealing, computeSquadBarrier as getPlayerSquadBarrier, computeOutgoingCrowdControl as getPlayerOutgoingCrowdControl } from "../../shared/combatMetrics";
import { Player } from '../../shared/dpsReportTypes';
import { DisruptionMethod } from '../global.d';
import { buildConditionIconMap, computeOutgoingConditions, normalizeConditionLabel, resolveBuffMetaById, resolveConditionNameFromEntry } from '../../shared/conditionsMetrics';
import { NON_DAMAGING_CONDITIONS, OFFENSE_METRICS, DEFENSE_METRICS, SUPPORT_METRICS } from './statsMetrics';
import { isResUtilitySkill } from './utils/dashboardUtils';
import { PlayerSkillDamageEntry } from './statsTypes';
import { PROFESSION_COLORS } from '../../shared/professionUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';

export interface PlayerStats {
    name: string;
    account: string;
    characterNames: Set<string>;
    downContrib: number;
    cleanses: number;
    strips: number;
    stab: number;
    healing: number;
    barrier: number;
    cc: number;
    logsJoined: number;
    totalDist: number;
    distCount: number;
    dodges: number;
    downs: number;
    deaths: number;
    totalFightMs: number;
    offenseTotals: Record<string, number>;
    offenseRateWeights: Record<string, number>;
    defenseActiveMs: number;
    defenseTotals: Record<string, number>;
    defenseMinionDamageTaken: Record<string, number>;
    supportActiveMs: number;
    supportTotals: Record<string, number>;
    healingActiveMs: number;
    healingTotals: Record<string, number>;
    profession: string;
    professions: Set<string>;
    professionList?: string[];
    professionTimeMs: Record<string, number>;
    squadActiveMs: number;
    firstSeenFightTs: number;
    lastSeenFightTs: number;
    lastSeenFightDurationMs: number;
    isCommander: boolean;
    damage: number;
    dps: number;
    revives: number;
    outgoingConditions: Record<string, any>;
    incomingConditions: Record<string, any>;
}

export type DamageMitigationTotals = {
    totalHits: number;
    blocked: number;
    evaded: number;
    glanced: number;
    missed: number;
    invulned: number;
    interrupted: number;
    totalMitigation: number;
    minMitigation: number;
};

export type DamageMitigationRow = {
    account: string;
    name: string;
    profession: string;
    professionList: string[];
    activeMs: number;
    mitigationTotals: DamageMitigationTotals;
};

export type DamageMitigationMinionRow = DamageMitigationRow & { minion: string };

export const getFightDownsDeaths = (details: any) => {
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

export const getFightOutcome = (details: any) => {
    const { squadDownsDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
    if (squadDownsDeaths > 0 || enemyDownsDeaths > 0) {
        return enemyDownsDeaths > squadDownsDeaths;
    }
    if (typeof details?.success === 'boolean') return details.success;
    return false;
};

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

export const resolveProfessionLabel = (name?: string) => {
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

export const computePlayerAggregation = ({
    validLogs,
    method,
    skillDamageSource,
    splitPlayersByClass,
}: {
    validLogs: any[];
    method: DisruptionMethod;
    skillDamageSource: string;
    splitPlayersByClass: boolean;
}) => {
    type SpecialBuffAggEntry = {
        key: string;
        account: string;
        profession: string;
        professions: Set<string>;
        professionTimeMs: Record<string, number>;
        totalMs: number;
        uptimeMs: number;
        durationMs: number;
    };

    let wins = 0;
    let losses = 0;
    let totalSquadSizeAccum = 0;
    let totalEnemiesAccum = 0;
    let totalSquadDeaths = 0;
    let totalSquadKills = 0;
    let totalEnemyDeaths = 0;
    let totalEnemyKills = 0;
    let totalSquadDowns = 0;
    let totalEnemyDowns = 0;

    const playerStats = new Map<string, PlayerStats>();
    const supportTimeSanityFields = new Set(['boonStripsTime', 'condiCleanseTime', 'condiCleanseTimeSelf']);
    const skillDamageMap: Record<number, { name: string, icon?: string, damage: number, hits: number, downContribution: number }> = {};
    const incomingSkillDamageMap: Record<number, { name: string, icon?: string, damage: number, hits: number }> = {};
    const playerSkillBreakdownMap = new Map<string, {
        key: string;
        account: string;
        displayName: string;
        profession: string;
        professionList: string[];
        totalFightMs: number;
        skills: Map<string, PlayerSkillDamageEntry>;
    }>();
    const outgoingCondiTotals: Record<string, any> = {};
    const incomingCondiTotals: Record<string, any> = {};
    const enemyProfessionCounts: Record<string, number> = {};
    const specialBuffMeta = new Map<string, { name?: string; stacking?: boolean; icon?: string }>();
    const specialBuffAgg = new Map<string, Map<string, SpecialBuffAggEntry>>();
    const specialBuffOutputAgg = new Map<string, Map<string, SpecialBuffAggEntry>>();

    const isBoon = (meta?: { classification?: string }) => {
        if (!meta?.classification) return true;
        return meta.classification === 'Boon';
    };

    const damageMitigationPlayersMap = new Map<string, DamageMitigationRow>();
    const damageMitigationMinionsMap = new Map<string, DamageMitigationMinionRow>();

    const createMitigationTotals = (): DamageMitigationTotals => ({
        totalHits: 0,
        blocked: 0,
        evaded: 0,
        glanced: 0,
        missed: 0,
        invulned: 0,
        interrupted: 0,
        totalMitigation: 0,
        minMitigation: 0
    });
    const readNumber = (value: any) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
    };
    const parseMitigationKey = (rawKey: string) => {
        const parts = String(rawKey).split('|');
        const name = parts[0] || 'Unknown';
        const profession = resolveProfessionLabel(parts[1] || 'Unknown');
        const account = parts[2] || name || 'Unknown';
        return { name, profession, account };
    };
    const ensureMitigationRow = (
        map: Map<string, DamageMitigationRow>,
        key: string,
        base: { account: string; name: string; profession: string }
    ) => {
        let row = map.get(key);
        if (!row) {
            row = {
                account: base.account,
                name: base.name,
                profession: base.profession,
                professionList: base.profession ? [base.profession] : [],
                activeMs: 0,
                mitigationTotals: createMitigationTotals()
            };
            map.set(key, row);
        } else if (base.profession && !row.professionList.includes(base.profession)) {
            row.professionList.push(base.profession);
        }
        return row;
    };
    const ensureMitigationMinionRow = (
        map: Map<string, DamageMitigationMinionRow>,
        key: string,
        base: { account: string; name: string; profession: string; minion: string }
    ) => {
        let row = map.get(key);
        if (!row) {
            row = {
                account: base.account,
                name: base.name,
                profession: base.profession,
                professionList: base.profession ? [base.profession] : [],
                activeMs: 0,
                mitigationTotals: createMitigationTotals(),
                minion: base.minion
            };
            map.set(key, row);
        } else if (base.profession && !row.professionList.includes(base.profession)) {
            row.professionList.push(base.profession);
        }
        return row;
    };
    const addMitigationTotals = (totals: DamageMitigationTotals, entry: any) => {
        totals.totalHits += readNumber(entry?.skill_hits ?? entry?.skillHits);
        totals.blocked += readNumber(entry?.blocked);
        totals.evaded += readNumber(entry?.evaded);
        totals.glanced += readNumber(entry?.glanced);
        totals.missed += readNumber(entry?.missed);
        totals.invulned += readNumber(entry?.invulned);
        totals.interrupted += readNumber(entry?.interrupted);
        totals.totalMitigation += readNumber(entry?.avoided_damage ?? entry?.avoidedDamage);
        totals.minMitigation += readNumber(entry?.min_avoided_damage ?? entry?.minAvoidedDamage);
    };

    const globalEnemySkillStats = new Map<number, { totalDamage: number; connectedHits: number; minTotal: number; minCount: number }>();
    const resolveGlobalEnemyStats = (skillId: number) => {
        const bucket = globalEnemySkillStats.get(skillId);
        if (!bucket) {
            return { hasSkill: false, avg: 1, min: 1, hits: 0 };
        }
        const hits = bucket.connectedHits || 0;
        const avg = hits > 0 ? bucket.totalDamage / hits : 0;
        const min = bucket.minCount > 0 ? bucket.minTotal / bucket.minCount : 0;
        return { hasSkill: true, avg, min, hits };
    };
    const mitigationCumulativeCounts = new Map<string, DamageMitigationTotals>();
    const mitigationMinionCumulativeCounts = new Map<string, DamageMitigationTotals>();
    const updateCumulativeCounts = (map: Map<string, DamageMitigationTotals>, key: string, delta: DamageMitigationTotals) => {
        const existing = map.get(key) || createMitigationTotals();
        existing.totalHits += delta.totalHits;
        existing.blocked += delta.blocked;
        existing.evaded += delta.evaded;
        existing.glanced += delta.glanced;
        existing.missed += delta.missed;
        existing.invulned += delta.invulned;
        existing.interrupted += delta.interrupted;
        map.set(key, existing);
        return existing;
    };
    const getPlayerIdentity = (player: any) => {
        const baseAccount = (player?.account && player.account !== 'Unknown') ? player.account : (player?.name || 'Unknown');
        const profession = resolveProfessionLabel(player?.profession || 'Unknown');
        const isSplit = splitPlayersByClass && profession !== 'Unknown';
        const key = isSplit ? `${baseAccount}::${profession}` : baseAccount;
        const accountLabel = baseAccount;
        return { key, baseAccount, profession, accountLabel, isSplit };
    };
    const getMitigationIdentity = (account: string, profession: string) => {
        const resolvedProfession = resolveProfessionLabel(profession || 'Unknown');
        const isSplit = splitPlayersByClass && resolvedProfession !== 'Unknown';
        const key = isSplit ? `${account}::${resolvedProfession}` : account;
        const accountLabel = account;
        return { key, accountLabel, profession: resolvedProfession };
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
    const resolveNonStackingFactor = (rawValue: number) => {
        const safeValue = Math.max(0, Number(rawValue || 0));
        if (!Number.isFinite(safeValue) || safeValue <= 0) return 0;
        if (safeValue <= 1) return safeValue;
        if (safeValue <= 100) return safeValue / 100;
        return 1;
    };
    const integrateSourceStates = (states: any, durationMs: number, stacking: boolean) => {
        const normalized = normalizeStatePairs(states);
        if (normalized.length === 0 || durationMs <= 0) return { totalMs: 0, uptimeMs: 0 };
        const resolvedDurationMs = Math.max(1, Number(durationMs || 0));
        const clampTime = (value: number) => Math.max(0, Math.min(resolvedDurationMs, Number(value || 0)));
        let totalMs = 0;
        let uptimeMs = 0;
        const addSegment = (startMs: number, endMs: number, value: number) => {
            const start = clampTime(startMs);
            const end = clampTime(endMs);
            if (end <= start) return;
            const segmentMs = Math.max(0, end - start);
            if (segmentMs <= 0) return;
            const safeValue = Math.max(0, Number(value || 0));
            if (safeValue <= 0) return;
            uptimeMs += segmentMs;
            if (stacking) {
                totalMs += segmentMs * safeValue;
            } else {
                totalMs += segmentMs * resolveNonStackingFactor(safeValue);
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
        return { totalMs, uptimeMs };
    };
    const ensureSpecialBuffEntry = (
        map: Map<string, Map<string, SpecialBuffAggEntry>>,
        buffId: string,
        key: string,
        account: string,
        profession: string
    ) => {
        if (!map.has(buffId)) {
            map.set(buffId, new Map());
        }
        const bucket = map.get(buffId)!;
        let agg = bucket.get(key);
        if (!agg) {
            agg = {
                key,
                account,
                profession: profession || 'Unknown',
                professions: new Set<string>(),
                professionTimeMs: {},
                totalMs: 0,
                uptimeMs: 0,
                durationMs: 0
            };
            bucket.set(key, agg);
        }
        return agg;
    };

    // Precompute global enemy averages across all logs (by skill id)
    validLogs.forEach((log) => {
        const details = log.details;
        if (!details) return;
        const targets = details.targets || [];
        targets.forEach((target: any) => {
            const dist = target?.totalDamageDist || [];
            const list = Array.isArray(dist) ? dist[0] : null;
            list?.forEach((entry: any) => {
                if (!entry?.id) return;
                const skillId = Number(entry.id);
                const globalBucket = globalEnemySkillStats.get(skillId) || { totalDamage: 0, connectedHits: 0, minTotal: 0, minCount: 0 };
                globalBucket.totalDamage += Number(entry.totalDamage || 0);
                globalBucket.connectedHits += Number(entry.connectedHits || 0);
                const minValueGlobal = Number.isFinite(Number(entry.min)) ? Number(entry.min) : 0;
                globalBucket.minTotal += minValueGlobal;
                globalBucket.minCount += 1;
                globalEnemySkillStats.set(skillId, globalBucket);
            });
        });
    });

    validLogs.forEach((log) => {
        const details = log.details;
        if (!details) return;
        const players = details.players as unknown as Player[];
        const squadPlayers = players.filter((player: any) => !player?.notInSquad);
        const allPlayers = Array.isArray(players) ? players : [];
        const specialBuffSourceIdentityByName = new Map<string, { key: string; accountLabel: string; profession: string }>();
        const specialBuffSourceIdentityByInstanceId = new Map<number, { key: string; accountLabel: string; profession: string }>();
        const specialBuffSourceActiveMsByKey = new Map<string, number>();
        const specialBuffOutputDurationSeen = new Set<string>();
        const registerSpecialSourceIdentity = (value: any, identity: { key: string; accountLabel: string; profession: string }) => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized) return;
            if (!specialBuffSourceIdentityByName.has(normalized)) {
                specialBuffSourceIdentityByName.set(normalized, identity);
            }
        };
        allPlayers.forEach((player: any) => {
            const identity = getPlayerIdentity(player);
            const sourceActiveMs = Array.isArray(player?.activeTimes) && typeof player.activeTimes[0] === 'number'
                ? Number(player.activeTimes[0] || 0)
                : Number(details?.durationMS || 0);
            specialBuffSourceActiveMsByKey.set(identity.key, Math.max(0, sourceActiveMs));
            const instanceId = Number(player?.instanceID);
            if (Number.isFinite(instanceId) && instanceId > 0 && !specialBuffSourceIdentityByInstanceId.has(instanceId)) {
                specialBuffSourceIdentityByInstanceId.set(instanceId, identity);
            }
            [player?.name, player?.display_name, player?.character_name, player?.account].forEach((candidate) => {
                registerSpecialSourceIdentity(candidate, identity);
            });
        });
        const targets = details.targets || [];

        // Basic Setup (Commander Tag, Distance Util)
        const replayMeta = (details as any).combatReplayMetaData || {};
        const inchesToPixel = replayMeta?.inchToPixel > 0 ? replayMeta.inchToPixel : 1;
        const pollingRate = replayMeta?.pollingRate > 0 ? replayMeta.pollingRate : 1;
        const RUN_BACK_RANGE = 5000;

        const toPairs = (value: any): Array<[number, number]> => {
            if (!Array.isArray(value)) return [];
            return value.map((entry: any) => (Array.isArray(entry) ? [Number(entry[0]), Number(entry[1])] as [number, number] : null))
                .filter((entry: any): entry is [number, number] => !!entry && Number.isFinite(entry[0]));
        };

        let commanderTagPositions: Array<[number, number]> = [];
        let deadTagMark = details.durationMS || 0;
        let deadTag = false;
        const commanderPlayer = players.find((player: any) => player?.hasCommanderTag && !player?.notInSquad);
        if (commanderPlayer?.combatReplayData?.positions) {
            commanderTagPositions = commanderPlayer.combatReplayData.positions as Array<[number, number]>;
            const commanderDeaths = toPairs(commanderPlayer.combatReplayData.dead);
            commanderDeaths.forEach(([deathTime]) => {
                if (deathTime > 0) {
                    deadTag = true;
                    deadTagMark = Math.min(deadTagMark, deathTime);
                }
            });
        }

        const getDistanceToTag = (p: any) => {
            const stats = p.statsAll?.[0];
            if (stats?.distToCom !== undefined && stats?.distToCom !== 'Infinity') return Math.round(Number(stats.distToCom));
            if (stats?.stackDist !== undefined) return Math.round(Number(stats.stackDist)) || 0;
            if (p.hasCommanderTag) return 0;

            const combatData = p.combatReplayData;
            if (!combatData?.positions || !commanderTagPositions.length) return 0;

            const playerPositions = combatData.positions as Array<[number, number]>;
            const playerDeaths = toPairs(combatData.dead);
            const playerDowns = toPairs(combatData.down);
            const playerOffset = Math.floor((combatData.start || 0) / pollingRate);
            let playerDistToTag = 0;

            if (playerDeaths.length && playerDowns.length) {
                for (const [deathKey] of playerDeaths) {
                    if (deathKey < 0) continue;
                    const positionMark = Math.max(0, Math.floor(deathKey / pollingRate)) - playerOffset;
                    for (const [downKey, downValue] of playerDowns) {
                        if (deathKey !== downValue) continue;
                        const playerDeadPoll = deadTag && downKey > deadTagMark
                            ? Math.max(1, Math.floor(deadTagMark / pollingRate))
                            : positionMark;

                        const limit = Math.max(0, Math.min(playerDeadPoll, playerPositions.length, commanderTagPositions.length));
                        if (limit <= 0) continue;
                        let sum = 0;
                        for (let i = 0; i < limit; i++) {
                            const [px, py] = playerPositions[i];
                            const [tx, ty] = commanderTagPositions[i];
                            sum += Math.hypot(px - tx, py - ty);
                        }
                        playerDistToTag = Math.round((sum / limit) / inchesToPixel);
                    }
                }
            }
            return playerDistToTag;
        };

        totalSquadSizeAccum += squadPlayers.length;
        totalEnemiesAccum += targets.filter((t: any) => !t.isFake).length;

        applyStabilityGeneration(players, { durationMS: details.durationMS, buffMap: details.buffMap });

        const { squadDownsDeaths, enemyDownsDeaths, squadDeaths, enemyDeaths } = getFightDownsDeaths(details);
        totalSquadDeaths += squadDeaths;
        totalSquadKills += enemyDeaths;
        totalEnemyKills += squadDeaths;
        totalEnemyDeaths += enemyDeaths;
        totalSquadDowns += Math.max(0, squadDownsDeaths - squadDeaths);
        totalEnemyDowns += Math.max(0, enemyDownsDeaths - enemyDeaths);

        const isWin = getFightOutcome(details);
        if (isWin) wins++; else losses++;

        const battleStandardSkillId = details.skillMap
            ? Number(Object.keys(details.skillMap).find((key) => details.skillMap?.[key]?.name === 'Battle Standard')?.replace(/^s/, ''))
            : null;

        players.forEach((p, playerIndex) => {
            if (p.notInSquad) return;
            const identity = getPlayerIdentity(p);
            const key = identity.key;
            const name = p.name || 'Unknown';

            if (!playerStats.has(key)) {
                playerStats.set(key, {
                    name, account: identity.accountLabel, characterNames: new Set<string>(), downContrib: 0, cleanses: 0, strips: 0, stab: 0, healing: 0, barrier: 0, cc: 0, logsJoined: 0,
                    totalDist: 0, distCount: 0, dodges: 0, downs: 0, deaths: 0, totalFightMs: 0,
                    offenseTotals: {}, offenseRateWeights: {}, defenseActiveMs: 0, defenseTotals: {}, defenseMinionDamageTaken: {}, supportActiveMs: 0, supportTotals: {},
                    healingActiveMs: 0, healingTotals: {}, profession: identity.profession, professions: new Set(),
                    professionTimeMs: {}, squadActiveMs: 0, firstSeenFightTs: 0, lastSeenFightTs: 0, lastSeenFightDurationMs: 0, isCommander: false, damage: 0, dps: 0, revives: 0, outgoingConditions: {}, incomingConditions: {}
                });
            }
            const s = playerStats.get(key)!;
            if (p.hasCommanderTag) s.isCommander = true;
            if (name && name !== 'Unknown') s.characterNames.add(String(name));
            if (p.profession && p.profession !== 'Unknown') {
                s.profession = p.profession;
                s.professions.add(p.profession);
                const activeMs = Array.isArray(p.activeTimes) && typeof p.activeTimes[0] === 'number' ? p.activeTimes[0] : details.durationMS || 0;
                s.professionTimeMs[p.profession] = (s.professionTimeMs[p.profession] || 0) + activeMs;
            }
            s.logsJoined++;
            s.downContrib += getPlayerDownContribution(p);
            s.cleanses += getPlayerCleanses(p);
            s.strips += getPlayerStrips(p, method);
            s.healing += getPlayerSquadHealing(p);
            s.barrier += getPlayerSquadBarrier(p);
            s.cc += getPlayerOutgoingCrowdControl(p, method);
            s.stab += p.stabGeneration || 0;

            const dist = getDistanceToTag(p);
            if (dist <= RUN_BACK_RANGE) {
                s.totalDist += dist;
                s.distCount++;
            }
            if (p.defenses?.[0]) {
                s.dodges += p.defenses[0].dodgeCount || 0;
                s.downs += p.defenses[0].downCount || 0;
                s.deaths += p.defenses[0].deadCount || 0;
            }
            if (details.durationMS) s.totalFightMs += details.durationMS;
            const activeMs = Array.isArray(p.activeTimes) && typeof p.activeTimes[0] === 'number' ? p.activeTimes[0] : details.durationMS || 0;
            s.squadActiveMs += activeMs;
            const fightTs = resolveFightTimestamp(details, log);
            const fightDurationMs = Number(details?.durationMS || 0);
            if (fightTs > 0) {
                if (s.firstSeenFightTs <= 0 || fightTs < s.firstSeenFightTs) {
                    s.firstSeenFightTs = fightTs;
                }
                if (s.lastSeenFightTs <= 0 || fightTs > s.lastSeenFightTs) {
                    s.lastSeenFightTs = fightTs;
                    s.lastSeenFightDurationMs = fightDurationMs;
                } else if (fightTs === s.lastSeenFightTs && fightDurationMs > s.lastSeenFightDurationMs) {
                    s.lastSeenFightDurationMs = fightDurationMs;
                }
            }
            s.defenseActiveMs += activeMs;
            s.supportActiveMs += activeMs;
            s.healingActiveMs += activeMs;

            if (Array.isArray(p.buffUptimes) && p.buffUptimes.length > 0) {
                p.buffUptimes.forEach((buff: any) => {
                    if (typeof buff?.id !== 'number') return;
                    const buffId = `b${buff.id}`;
                    const meta = details.buffMap?.[buffId] || details.buffMap?.[String(buff.id)];
                    if (!meta || isBoon(meta)) return;
                    const uptime = Number(buff.buffData?.[0]?.uptime ?? 0);
                    const presence = Number(buff.buffData?.[0]?.presence ?? 0);
                    if ((!Number.isFinite(uptime) || uptime <= 0) && (!Number.isFinite(presence) || presence <= 0)) return;
                    const stacking = meta?.stacking ?? false;
                    const uptimeFactor = stacking ? (Number.isFinite(uptime) ? uptime : 0) : (Number.isFinite(uptime) ? uptime / 100 : 0);
                    const totalMs = uptimeFactor * activeMs;
                    const uptimePercentRaw = stacking ? presence : uptime;
                    const uptimePercentFactor = Math.min(Math.max(Number.isFinite(uptimePercentRaw) ? uptimePercentRaw : 0, 0), 100) / 100;
                    const uptimeMs = uptimePercentFactor * activeMs;
                    const hasTotalMs = Number.isFinite(totalMs) && totalMs > 0;
                    const hasUptimeMs = Number.isFinite(uptimeMs) && uptimeMs > 0;
                    if (!hasTotalMs && !hasUptimeMs) return;

                    const conditionName = normalizeConditionLabel(meta?.name);
                    if (conditionName && NON_DAMAGING_CONDITIONS.has(conditionName) && (!meta?.classification || meta.classification === 'Condition')) {
                        const seconds = totalMs / 1000;
                        const conditionIcon = meta?.icon;
                        const outgoingSummary = outgoingCondiTotals[conditionName] || {
                            name: conditionName,
                            icon: conditionIcon,
                            applications: 0,
                            damage: 0
                        };
                        outgoingSummary.applicationsFromUptime = (outgoingSummary.applicationsFromUptime || 0) + seconds;
                        if (!outgoingSummary.icon && conditionIcon) outgoingSummary.icon = conditionIcon;
                        outgoingCondiTotals[conditionName] = outgoingSummary;

                        const outgoingEntry = s.outgoingConditions[conditionName] || {
                            applications: 0,
                            damage: 0,
                            skills: {},
                            icon: conditionIcon
                        };
                        outgoingEntry.applicationsFromUptime = (outgoingEntry.applicationsFromUptime || 0) + seconds;
                        if (!outgoingEntry.icon && conditionIcon) outgoingEntry.icon = conditionIcon;
                        s.outgoingConditions[conditionName] = outgoingEntry;

                        const incomingSummary = incomingCondiTotals[conditionName] || {
                            name: conditionName,
                            icon: conditionIcon,
                            applications: 0,
                            damage: 0
                        };
                        incomingSummary.applicationsFromUptime = (incomingSummary.applicationsFromUptime || 0) + seconds;
                        if (!incomingSummary.icon && conditionIcon) incomingSummary.icon = conditionIcon;
                        incomingCondiTotals[conditionName] = incomingSummary;

                        const incomingEntry = s.incomingConditions[conditionName] || {
                            applications: 0,
                            damage: 0,
                            skills: {},
                            icon: conditionIcon
                        };
                        incomingEntry.applicationsFromUptime = (incomingEntry.applicationsFromUptime || 0) + seconds;
                        if (!incomingEntry.icon && conditionIcon) incomingEntry.icon = conditionIcon;
                        s.incomingConditions[conditionName] = incomingEntry;
                    }

                    if (!specialBuffMeta.has(buffId)) {
                        specialBuffMeta.set(buffId, { name: meta?.name, stacking, icon: meta?.icon });
                    }

                    const specialBucketKey = identity.key;
                    const agg = ensureSpecialBuffEntry(
                        specialBuffAgg,
                        buffId,
                        specialBucketKey,
                        identity.accountLabel,
                        s.profession || p.profession || 'Unknown'
                    );
                    const prof = p.profession || s.profession;
                    if (prof && prof !== 'Unknown') {
                        agg.professions.add(prof);
                        agg.professionTimeMs[prof] = (agg.professionTimeMs[prof] || 0) + activeMs;
                        agg.profession = prof;
                    }
                    agg.totalMs += hasTotalMs ? totalMs : 0;
                    agg.uptimeMs += hasUptimeMs ? uptimeMs : 0;
                    agg.durationMs += activeMs;

                    const statesPerSource = (buff?.statesPerSource && typeof buff.statesPerSource === 'object')
                        ? buff.statesPerSource
                        : null;
                    if (statesPerSource) {
                        Object.entries(statesPerSource).forEach(([sourceName, states]) => {
                            const sourceNameText = String(sourceName || '').trim();
                            const sourceNameLower = sourceNameText.toLowerCase();
                            const instanceMatch = sourceNameText.match(/\bpl-(\d+)\b/i);
                            const sourceIdentity = specialBuffSourceIdentityByName.get(sourceNameLower)
                                || (instanceMatch ? specialBuffSourceIdentityByInstanceId.get(Number(instanceMatch[1])) : undefined)
                                || {
                                    key: `source:${sourceNameLower || 'unknown'}`,
                                    accountLabel: sourceNameText || 'Unknown Source',
                                    profession: resolveProfessionLabel(sourceNameText.replace(/\s+pl-\d+\s*$/i, '').trim() || 'Unknown')
                                };
                            const sourceDurationMs = Number(specialBuffSourceActiveMsByKey.get(sourceIdentity.key) || details?.durationMS || 0);
                            if (!Number.isFinite(sourceDurationMs) || sourceDurationMs <= 0) return;
                            const sourceContribution = integrateSourceStates(states, sourceDurationMs, stacking);
                            const hasSourceTotal = Number.isFinite(sourceContribution.totalMs) && sourceContribution.totalMs > 0;
                            const hasSourceUptime = Number.isFinite(sourceContribution.uptimeMs) && sourceContribution.uptimeMs > 0;
                            if (!hasSourceTotal && !hasSourceUptime) return;
                            const sourceAgg = ensureSpecialBuffEntry(
                                specialBuffOutputAgg,
                                buffId,
                                sourceIdentity.key,
                                sourceIdentity.accountLabel,
                                sourceIdentity.profession
                            );
                            const sourceProf = sourceIdentity.profession || 'Unknown';
                            if (sourceProf && sourceProf !== 'Unknown') {
                                sourceAgg.professions.add(sourceProf);
                                sourceAgg.profession = sourceProf;
                            }
                            sourceAgg.totalMs += hasSourceTotal ? sourceContribution.totalMs : 0;
                            sourceAgg.uptimeMs += hasSourceUptime ? sourceContribution.uptimeMs : 0;
                            const durationSeenKey = `${buffId}::${sourceIdentity.key}`;
                            if (!specialBuffOutputDurationSeen.has(durationSeenKey)) {
                                specialBuffOutputDurationSeen.add(durationSeenKey);
                                if (sourceProf && sourceProf !== 'Unknown') {
                                    sourceAgg.professionTimeMs[sourceProf] = (sourceAgg.professionTimeMs[sourceProf] || 0) + sourceDurationMs;
                                }
                                sourceAgg.durationMs += sourceDurationMs;
                            }
                        });
                    }
                });
            }

            if (p.defenses?.[0]) {
                const normalizeMinionName = (rawName: any) => {
                    let minionName = String(rawName || 'Unknown').replace(/^Juvenile\s+/i, '') || 'Unknown';
                    if (minionName.toUpperCase().includes('UNKNOWN')) minionName = 'Unknown';
                    return minionName;
                };
                const getMinionDamageTaken = () => {
                    const minions = Array.isArray((p as any)?.minions) ? (p as any).minions : [];
                    if (minions.length === 0) return { total: 0, byMinion: {} as Record<string, number> };
                    let total = 0;
                    const byMinion: Record<string, number> = {};
                    minions.forEach((minion: any) => {
                        const dist = Array.isArray(minion?.totalDamageTakenDist) ? minion.totalDamageTakenDist : [];
                        const entries = Array.isArray(dist[0]) ? dist[0] : [];
                        const minionName = normalizeMinionName(minion?.name);
                        entries.forEach((entry: any) => {
                            const damage = Number(entry?.totalDamage ?? entry?.damageTaken ?? 0);
                            if (Number.isFinite(damage)) {
                                total += damage;
                                byMinion[minionName] = (byMinion[minionName] || 0) + damage;
                            }
                        });
                    });
                    return { total, byMinion };
                };
                const minionDamage = getMinionDamageTaken();
                if (minionDamage.byMinion && typeof minionDamage.byMinion === 'object') {
                    Object.entries(minionDamage.byMinion).forEach(([minionName, damage]) => {
                        const numeric = Number(damage || 0);
                        if (!Number.isFinite(numeric) || numeric <= 0) return;
                        s.defenseMinionDamageTaken[minionName] = (s.defenseMinionDamageTaken[minionName] || 0) + numeric;
                    });
                }
                DEFENSE_METRICS.forEach(m => {
                    const val = m.id === 'minionDamageTaken'
                        ? minionDamage.total
                        : Number((p.defenses![0] as any)[m.field!] ?? 0);
                    if (Number.isFinite(val)) s.defenseTotals[m.id] = (s.defenseTotals[m.id] || 0) + val;
                });
            }
            if (p.support?.[0]) {
                SUPPORT_METRICS.forEach(m => {
                    let val = Number((p.support![0] as any)[m.field!] ?? 0);
                    if (Number.isFinite(val)) {
                        if (supportTimeSanityFields.has(m.field!) && val > 999999) val = 0;
                        s.supportTotals[m.id] = (s.supportTotals[m.id] || 0) + val;
                    }
                });
            }

            // Healing
            const addHealing = (key: string, val: number) => {
                if (Number.isFinite(val)) s.healingTotals[key] = (s.healingTotals[key] || 0) + val;
            };
            const sumPhaseValue = (phases: any[] | undefined, field: string) => {
                if (!Array.isArray(phases)) return 0;
                return phases.reduce((sum, phase) => sum + Number(phase?.[field] ?? 0), 0);
            };
            const addHealingByCategory = (fieldBase: 'healing' | 'downedHealing' | 'barrier', allyIdx: number, value: number) => {
                if (!Number.isFinite(value) || value <= 0) return;
                const ally = players[allyIdx];
                const isSelf = allyIdx === playerIndex;
                const isOffSquad = ally?.notInSquad;
                const isSquad = !isOffSquad;
                const isGroup = isSquad && ally?.group != null && ally.group === p.group;

                addHealing(fieldBase, value);
                if (isSquad) addHealing(`squad${fieldBase[0].toUpperCase()}${fieldBase.slice(1)}`, value);
                if (isGroup) addHealing(`group${fieldBase[0].toUpperCase()}${fieldBase.slice(1)}`, value);
                if (isSelf) addHealing(`self${fieldBase[0].toUpperCase()}${fieldBase.slice(1)}`, value);
                if (isOffSquad) addHealing(`offSquad${fieldBase[0].toUpperCase()}${fieldBase.slice(1)}`, value);
            };
            if (Array.isArray(p.rotation)) {
                let resCasts = 0;
                p.rotation.forEach((rot: any) => {
                    if (!rot?.id || !isResUtilitySkill(rot.id, details.skillMap)) return;
                    const count = rot.skills?.length || 0;
                    if (count > 0) { resCasts += count; addHealing(`resUtility_s${rot.id}`, count); }
                });
                if (resCasts > 0) addHealing('resUtility', resCasts);
            }
            const outgoingHealingAllies = p.extHealingStats?.outgoingHealingAllies;
            if (Array.isArray(outgoingHealingAllies)) {
                outgoingHealingAllies.forEach((allyPhases, allyIdx) => {
                    const healing = sumPhaseValue(allyPhases, 'healing');
                    const downedHealing = sumPhaseValue(allyPhases, 'downedHealing');
                    addHealingByCategory('healing', allyIdx, healing);
                    addHealingByCategory('downedHealing', allyIdx, downedHealing);
                });
            }
            const outgoingBarrierAllies = p.extBarrierStats?.outgoingBarrierAllies;
            if (Array.isArray(outgoingBarrierAllies)) {
                outgoingBarrierAllies.forEach((allyPhases, allyIdx) => {
                    const barrier = sumPhaseValue(allyPhases, 'barrier');
                    addHealingByCategory('barrier', allyIdx, barrier);
                });
            }

            // Offense
            const statsAll = p.statsAll?.[0];
            const dpsAll = p.dpsAll?.[0];
            const support = p.support?.[0];
            OFFENSE_METRICS.forEach(m => {
                if (m.id === 'downContributionPercent' || m.id === 'downContribution') return;
                if (!m.field) return;
                let val = 0;
                let denom = 0;
                if (m.source === 'dpsAll' && dpsAll) val = Number((dpsAll as any)[m.field!] ?? 0);
                else if (m.source === 'statsAll' && statsAll) {
                    val = Number((statsAll as any)[m.field!] ?? 0);
                    denom = Number((statsAll as any)[m.denomField || m.weightField || 'connectedDamageCount'] ?? 0);
                } else if (m.source === 'support' && support) {
                    val = Number((support as any)[m.field!] ?? 0);
                } else if (p.statsTargets) {
                    p.statsTargets.forEach((t: any) => {
                        if (!t?.[0]) return;
                        val += Number(t[0][m.field!] ?? 0);
                        denom += Number(t[0][m.denomField || m.weightField || 'connectedDamageCount'] ?? 0);
                    });
                }
                if (Number.isFinite(val)) {
                    s.offenseTotals[m.id] = (s.offenseTotals[m.id] || 0) + val;
                    if (m.isRate && denom > 0) s.offenseRateWeights[m.id] = (s.offenseRateWeights[m.id] || 0) + denom;
                }
            });
            // Use computeDownContribution for offenseTotals.downContribution — it falls back to
            // totalDamageDist when EI uses the aggregate "Enemy Players" target (which zeroes statsTargets.downContribution)
            s.offenseTotals.downContribution = (s.offenseTotals.downContribution || 0) + getPlayerDownContribution(p);
            if (p.targetDamageDist && Number.isFinite(battleStandardSkillId)) {
                const connectedHits = p.targetDamageDist
                    .flatMap((group: any) => group || [])
                    .flatMap((list: any) => list || [])
                    .reduce((sum: number, entry: any) => {
                        if (!entry?.id) return sum;
                        return entry.id === battleStandardSkillId ? sum + (entry?.connectedHits || 0) : sum;
                    }, 0);
                s.offenseTotals.battleStandardHits = (s.offenseTotals.battleStandardHits || 0) + connectedHits;
            }

            s.revives += p.support?.[0]?.resurrects || 0;
            if (dpsAll) {
                s.damage += dpsAll.damage || 0;
                s.dps += dpsAll.dps || 0;
            }

            // Skill Damage (Global + Player Breakdown)
            const resolveSkillMeta = (entry: any) => {
                let name = `Skill ${entry.id}`;
                const mapped = details.skillMap?.[`s${entry.id}`] || details.skillMap?.[`${entry.id}`];
                let icon = mapped?.icon;
                if (mapped?.name) name = mapped.name;
                const buffMeta = resolveBuffMetaById(details.buffMap, entry.id);
                if (name.startsWith('Skill ') && buffMeta?.name) {
                    name = buffMeta.name;
                    icon = buffMeta.icon || icon;
                }
                if (name.startsWith('Skill ')) {
                    const conditionName = resolveConditionNameFromEntry(name, entry.id, details.buffMap);
                    if (conditionName) {
                        name = conditionName;
                        icon = buffMeta?.icon || icon;
                    }
                }
                return { name, icon };
            };
            const pushSkillDamageEntry = (entry: any) => {
                if (!entry?.id) return;
                const { name, icon } = resolveSkillMeta(entry);
                if (!skillDamageMap[entry.id]) skillDamageMap[entry.id] = { name, icon, damage: 0, hits: 0, downContribution: 0 };
                if (skillDamageMap[entry.id].name.startsWith('Skill ') && !name.startsWith('Skill ')) skillDamageMap[entry.id].name = name;
                if (!skillDamageMap[entry.id].icon && icon) skillDamageMap[entry.id].icon = icon;
                skillDamageMap[entry.id].damage += entry.totalDamage;
                skillDamageMap[entry.id].hits += entry.connectedHits;
                skillDamageMap[entry.id].downContribution += Number(entry.downContribution || 0);
            };
            const playerAccount = p.account || p.name || 'Unknown';
            const playerProfession = p.profession || 'Unknown';
            const playerKey = `${playerAccount}|${playerProfession}`;
            let playerBreakdown = playerSkillBreakdownMap.get(playerKey);
            if (!playerBreakdown) {
                playerBreakdown = {
                    key: playerKey,
                    account: playerAccount,
                    displayName: playerAccount,
                    profession: playerProfession,
                    professionList: [playerProfession],
                    totalFightMs: 0,
                    skills: new Map()
                };
                playerSkillBreakdownMap.set(playerKey, playerBreakdown);
            }
            if (playerProfession && !playerBreakdown.professionList.includes(playerProfession)) {
                playerBreakdown.professionList.push(playerProfession);
            }
            playerBreakdown.totalFightMs += details.durationMS || 0;
            const pushPlayerSkillEntry = (entry: any) => {
                if (!entry?.id) return;
                const { name, icon } = resolveSkillMeta(entry);
                const skillId = `s${entry.id}`;
                let skillEntry = playerBreakdown!.skills.get(skillId);
                if (!skillEntry) {
                    skillEntry = { id: skillId, name, icon, damage: 0, downContribution: 0 };
                    playerBreakdown!.skills.set(skillId, skillEntry);
                }
                if (skillEntry.name.startsWith('Skill ') && !name.startsWith('Skill ')) skillEntry.name = name;
                if (!skillEntry.icon && icon) skillEntry.icon = icon;
                skillEntry.damage += Number(entry.totalDamage || 0);
                skillEntry.downContribution += Number(entry.downContribution || 0);
            };
            if (skillDamageSource === 'total') {
                p.totalDamageDist?.forEach((list: any) => {
                    list?.forEach((entry: any) => {
                        pushSkillDamageEntry(entry);
                        pushPlayerSkillEntry(entry);
                    });
                });
            } else {
                const targetSkillTotals = new Map<number, { damage: number; hits: number; downContribution: number }>();
                p.targetDamageDist?.forEach((targetGroup: any) => {
                    targetGroup?.forEach((list: any) => {
                        list?.forEach((entry: any) => {
                            const skillId = Number(entry?.id);
                            if (Number.isFinite(skillId)) {
                                const existing = targetSkillTotals.get(skillId) || { damage: 0, hits: 0, downContribution: 0 };
                                existing.damage += Number(entry?.totalDamage || 0);
                                existing.hits += Number(entry?.connectedHits || 0);
                                existing.downContribution += Number(entry?.downContribution || 0);
                                targetSkillTotals.set(skillId, existing);
                            }
                            pushSkillDamageEntry(entry);
                            pushPlayerSkillEntry(entry);
                        });
                    });
                });
                const allowTotalSupplement = !details?.detailedWvW;
                if (allowTotalSupplement) {
                    // Some logs under-report or omit entries in targetDamageDist; supplement from totalDamageDist.
                    p.totalDamageDist?.forEach((list: any) => {
                        list?.forEach((entry: any) => {
                            const skillId = Number(entry?.id);
                            if (!Number.isFinite(skillId)) return;
                            const target = targetSkillTotals.get(skillId);
                            if (!target) {
                                pushSkillDamageEntry(entry);
                                pushPlayerSkillEntry(entry);
                                return;
                            }
                            const totalDamage = Number(entry?.totalDamage || 0);
                            const totalHits = Number(entry?.connectedHits || 0);
                            const totalDownContribution = Number(entry?.downContribution || 0);
                            const deltaDamage = totalDamage - Number(target.damage || 0);
                            const deltaHits = totalHits - Number(target.hits || 0);
                            const deltaDownContribution = totalDownContribution - Number(target.downContribution || 0);
                            if (deltaDamage <= 0 && deltaHits <= 0 && deltaDownContribution <= 0) return;
                            const reconciledEntry = {
                                ...entry,
                                totalDamage: Math.max(0, deltaDamage),
                                connectedHits: Math.max(0, deltaHits),
                                downContribution: Math.max(0, deltaDownContribution)
                            };
                            pushSkillDamageEntry(reconciledEntry);
                            pushPlayerSkillEntry(reconciledEntry);
                        });
                    });
                }
            }
            if (p.totalDamageTaken) {
                p.totalDamageTaken.forEach((list: any) => {
                    list?.forEach((entry: any) => {
                        if (!entry?.id) return;
                        let name = `Skill ${entry.id}`;
                        const mapped = details.skillMap?.[`s${entry.id}`] || details.skillMap?.[`${entry.id}`];
                        let icon = mapped?.icon;
                        if (mapped?.name) name = mapped.name;
                        const buffMeta = resolveBuffMetaById(details.buffMap, entry.id);
                        if (name.startsWith('Skill ') && buffMeta?.name) {
                            name = buffMeta.name;
                            icon = buffMeta.icon || icon;
                        }
                        if (name.startsWith('Skill ')) {
                            const conditionName = resolveConditionNameFromEntry(name, entry.id, details.buffMap);
                            if (conditionName) {
                                name = conditionName;
                                icon = buffMeta?.icon || icon;
                            }
                        }
                        if (!incomingSkillDamageMap[entry.id]) incomingSkillDamageMap[entry.id] = { name, icon, damage: 0, hits: 0 };
                        if (!incomingSkillDamageMap[entry.id].name.startsWith('Skill ') || name.startsWith('Skill ')) incomingSkillDamageMap[entry.id].name = name;
                        if (!incomingSkillDamageMap[entry.id].icon && icon) incomingSkillDamageMap[entry.id].icon = icon;
                        incomingSkillDamageMap[entry.id].damage += entry.totalDamage;
                        incomingSkillDamageMap[entry.id].hits += entry.hits;
                    });
                });
            }
        });

        targets.forEach((t: any) => {
            if (t?.isFake) return;
            const name = resolveProfessionLabel(t?.profession || t?.name || t?.id);
            if (!name) return;
            enemyProfessionCounts[name] = (enemyProfessionCounts[name] || 0) + 1;
        });

        // Conditions Logic
        const conditionResult = computeOutgoingConditions({
            players: players as any,
            targets: targets as any,
            skillMap: details.skillMap,
            buffMap: details.buffMap,
            getPlayerKey: (pl: any) => getPlayerIdentity(pl).key
        });
        const conditionIconMap = buildConditionIconMap(details.buffMap);
        Object.entries(conditionResult.playerConditions).forEach(([k, totals]) => {
            const ps = playerStats.get(k);
            if (!ps) return;
            Object.entries(totals).forEach(([cName, v]) => {
                const ex = ps.outgoingConditions[cName] || { applications: 0, damage: 0, skills: {}, icon: v.icon };
                ex.applications += Number(v.applications || 0);
                ex.damage += Number(v.damage || 0);
                if (v.applicationsFromBuffs) ex.applicationsFromBuffs = (ex.applicationsFromBuffs || 0) + v.applicationsFromBuffs;
                if (v.applicationsFromBuffsActive) ex.applicationsFromBuffsActive = (ex.applicationsFromBuffsActive || 0) + v.applicationsFromBuffsActive;
                Object.entries(v.skills || {}).forEach(([sn, sv]) => {
                    const sk = ex.skills[sn] || { name: sv.name, hits: 0, damage: 0, icon: sv.icon };
                    sk.hits += Number(sv.hits || 0);
                    sk.damage += Number(sv.damage || 0);
                    if (!sk.icon && sv.icon) sk.icon = sv.icon;
                    ex.skills[sn] = sk;
                });
                if (!ex.icon && v.icon) ex.icon = v.icon;
                ps.outgoingConditions[cName] = ex;
            });
        });
        Object.entries(conditionResult.summary).forEach(([cName, v]) => {
            const ex = outgoingCondiTotals[cName] || { name: v.name || cName, icon: v.icon, applications: 0, damage: 0 };
            ex.applications += Number(v.applications || 0);
            ex.damage += Number(v.damage || 0);
            if (v.applicationsFromBuffs) ex.applicationsFromBuffs = (ex.applicationsFromBuffs || 0) + v.applicationsFromBuffs;
            if (v.applicationsFromBuffsActive) ex.applicationsFromBuffsActive = (ex.applicationsFromBuffsActive || 0) + v.applicationsFromBuffsActive;
            if (!ex.icon && v.icon) ex.icon = v.icon;
            outgoingCondiTotals[cName] = ex;
        });

        // Incoming conditions
        squadPlayers.forEach((p: any) => {
            const key = getPlayerIdentity(p).key;
            const ps = playerStats.get(key);
            if (!ps || !p.totalDamageTaken) return;
            p.totalDamageTaken.forEach((list: any) => list?.forEach((entry: any) => {
                if (!entry?.id) return;
                let sName = `Skill ${entry.id}`;
                const sm = details.skillMap?.[`s${entry.id}`] || details.skillMap?.[`${entry.id}`];
                if (sm?.name) sName = sm.name;
                const buffMeta = resolveBuffMetaById(details.buffMap, entry.id);
                if (sName.startsWith('Skill ') && buffMeta?.name) sName = buffMeta.name;
                const finalName = resolveConditionNameFromEntry(sName, entry.id, details.buffMap);
                if (!finalName) return;
                const buffName = buffMeta?.name;
                const conditionIcon = conditionIconMap.get(finalName) || buffMeta?.icon;
                const skillIcon = sm?.icon || buffMeta?.icon || conditionIcon;
                if (sName.startsWith('Skill ') && (buffName || finalName)) {
                    sName = buffName || finalName;
                }
                const hits = Number(entry.hits ?? 0);
                const dmg = Number(entry.totalDamage ?? 0);

                const summ = incomingCondiTotals[finalName] || { name: finalName, icon: conditionIcon, applications: 0, damage: 0 };
                summ.applications += Number.isFinite(hits) ? hits : 0;
                summ.damage += Number.isFinite(dmg) ? dmg : 0;
                if (!summ.icon && conditionIcon) summ.icon = conditionIcon;
                incomingCondiTotals[finalName] = summ;

                const pEntry = ps.incomingConditions[finalName] || { applications: 0, damage: 0, skills: {}, icon: conditionIcon };
                pEntry.applications += Number.isFinite(hits) ? hits : 0;
                pEntry.damage += Number.isFinite(dmg) ? dmg : 0;
                const skEntry = pEntry.skills[sName] || { name: sName, hits: 0, damage: 0, icon: skillIcon };
                skEntry.hits += Number.isFinite(hits) ? hits : 0;
                skEntry.damage += Number.isFinite(dmg) ? dmg : 0;
                if (!skEntry.icon && skillIcon) skEntry.icon = skillIcon;
                pEntry.skills[sName] = skEntry;
                if (!pEntry.icon && conditionIcon) pEntry.icon = conditionIcon;
                ps.incomingConditions[finalName] = pEntry;
            }));
        });

        const mitigationSource = (details as any).player_damage_mitigation || (details as any).playerDamageMitigation;
        const hasMitigationSource = mitigationSource && typeof mitigationSource === 'object' && Object.keys(mitigationSource).length > 0;
        if (hasMitigationSource) {
            Object.entries(mitigationSource).forEach(([rawKey, skillMap]) => {
                if (!skillMap || typeof skillMap !== 'object') return;
                const base = parseMitigationKey(rawKey);
                const identity = getMitigationIdentity(base.account, base.profession);
                const row = ensureMitigationRow(damageMitigationPlayersMap, identity.key, { ...base, account: identity.accountLabel, profession: identity.profession });
                Object.values(skillMap as any).forEach((entry: any) => {
                    const avoided = readNumber(entry?.avoided_damage ?? entry?.avoidedDamage);
                    if (avoided <= 0) return;
                    addMitigationTotals(row.mitigationTotals, entry);
                });
            });
        }
        const mitigationMinionSource = (details as any).player_minion_damage_mitigation || (details as any).playerMinionDamageMitigation;
        const hasMitigationMinionSource = mitigationMinionSource && typeof mitigationMinionSource === 'object' && Object.keys(mitigationMinionSource).length > 0;
        if (hasMitigationMinionSource) {
            Object.entries(mitigationMinionSource).forEach(([rawKey, minionMap]) => {
                if (!minionMap || typeof minionMap !== 'object') return;
                const base = parseMitigationKey(rawKey);
                const identity = getMitigationIdentity(base.account, base.profession);
                Object.entries(minionMap as any).forEach(([minionName, skillMap]) => {
                    if (!skillMap || typeof skillMap !== 'object') return;
                    const rowKey = `${identity.key}::${minionName}`;
                    const row = ensureMitigationMinionRow(damageMitigationMinionsMap, rowKey, {
                        ...base,
                        account: identity.accountLabel,
                        profession: identity.profession,
                        minion: String(minionName || 'Unknown')
                    });
                    Object.values(skillMap as any).forEach((entry: any) => {
                        addMitigationTotals(row.mitigationTotals, entry);
                    });
                });
            });
        }

        if (!hasMitigationSource || !hasMitigationMinionSource) {

            if (!hasMitigationSource) {
                squadPlayers.forEach((player: any) => {
                    const entries = player?.totalDamageTaken || [];
                    if (!Array.isArray(entries) || entries.length === 0) return;
                    const identity = getPlayerIdentity(player);
                    const base = {
                        account: identity.accountLabel,
                        name: player.name || identity.accountLabel,
                        profession: identity.profession
                    };
                    ensureMitigationRow(damageMitigationPlayersMap, identity.key, base);
                    const list = Array.isArray(entries) ? entries[0] : null;
                    list?.forEach((entry: any) => {
                        if (!entry?.id) return;
                        const blocked = readNumber(entry.blocked);
                        const evaded = readNumber(entry.evaded);
                        const glanced = readNumber(entry.glance ?? entry.glanced);
                        const missed = readNumber(entry.missed);
                        const invulned = readNumber(entry.invulned);
                        const interrupted = readNumber(entry.interrupted);
                        const skillHits = readNumber(entry.hits ?? entry.connectedHits);
                        const skillId = Number(entry.id);
                        updateCumulativeCounts(
                            mitigationCumulativeCounts,
                            `${identity.key}::${skillId}`,
                            {
                                totalHits: skillHits,
                                blocked,
                                evaded,
                                glanced,
                                missed,
                                invulned,
                                interrupted,
                                totalMitigation: 0,
                                minMitigation: 0
                            }
                        );
                    });
                });
            }

            if (!hasMitigationMinionSource) {
                squadPlayers.forEach((player: any) => {
                    const minions = player?.minions || [];
                    if (!Array.isArray(minions) || minions.length === 0) return;
                    const identity = getPlayerIdentity(player);
                    const base = {
                        account: identity.accountLabel,
                        name: player.name || identity.accountLabel,
                        profession: identity.profession
                    };
                    minions.forEach((minion: any) => {
                        const minionEntries = minion?.totalDamageTakenDist || [];
                        if (!Array.isArray(minionEntries) || minionEntries.length === 0) return;
                        let minionName = String(minion?.name || 'Unknown').replace(/^Juvenile\s+/i, '') || 'Unknown';
                        if (minionName.toUpperCase().includes('UNKNOWN')) minionName = 'Unknown';
                        const rowKey = `${identity.key}::${minionName}`;
                        ensureMitigationMinionRow(damageMitigationMinionsMap, rowKey, { ...base, minion: minionName });
                        const list = Array.isArray(minionEntries) ? minionEntries[0] : null;
                        list?.forEach((entry: any) => {
                            if (!entry?.id) return;
                            const blocked = readNumber(entry.blocked);
                            const evaded = readNumber(entry.evaded);
                            const glanced = readNumber(entry.glance ?? entry.glanced);
                            const missed = readNumber(entry.missed);
                            const invulned = readNumber(entry.invulned);
                            const interrupted = readNumber(entry.interrupted);
                            const skillHits = readNumber(entry.hits ?? entry.connectedHits);
                            const skillId = Number(entry.id);
                            updateCumulativeCounts(
                                mitigationMinionCumulativeCounts,
                                `${rowKey}::${skillId}`,
                                {
                                    totalHits: skillHits,
                                    blocked,
                                    evaded,
                                    glanced,
                                    missed,
                                    invulned,
                                    interrupted,
                                    totalMitigation: 0,
                                    minMitigation: 0
                                }
                            );
                        });
                    });
                });
            }
        }

    }); // End Logs Loop

    const recomputeMitigationTotals = (
        rows: Map<string, DamageMitigationRow>,
        cumulative: Map<string, DamageMitigationTotals>
    ) => {
        const aggregate = new Map<string, DamageMitigationTotals>();
        const ensureAggregate = (key: string) => {
            let bucket = aggregate.get(key);
            if (!bucket) {
                bucket = createMitigationTotals();
                aggregate.set(key, bucket);
            }
            return bucket;
        };
        cumulative.forEach((counts, key) => {
            const splitIndex = key.lastIndexOf('::');
            const rowKey = splitIndex > -1 ? key.slice(0, splitIndex) : key;
            const skillId = splitIndex > -1 ? Number(key.slice(splitIndex + 2)) : Number.NaN;
            const enemy = Number.isFinite(skillId) ? resolveGlobalEnemyStats(skillId) : { hasSkill: false, avg: 0, min: 0, hits: 0 };
            if (!enemy.hasSkill || enemy.hits <= 0) return;
            const avg = enemy.avg;
            const min = enemy.min;
            const avoid = counts.glanced * avg / 2 + (counts.blocked + counts.evaded + counts.missed + counts.invulned + counts.interrupted) * avg;
            const avoidMin = counts.glanced * min / 2 + (counts.blocked + counts.evaded + counts.missed + counts.invulned + counts.interrupted) * min;
            if (avoid <= 0) return;
            const bucket = ensureAggregate(rowKey);
            bucket.totalHits += counts.totalHits;
            bucket.blocked += counts.blocked;
            bucket.evaded += counts.evaded;
            bucket.glanced += counts.glanced;
            bucket.missed += counts.missed;
            bucket.invulned += counts.invulned;
            bucket.interrupted += counts.interrupted;
            bucket.totalMitigation += avoid;
            bucket.minMitigation += avoidMin;
        });
        rows.forEach((row, rowKey) => {
            const totals = aggregate.get(rowKey) || createMitigationTotals();
            row.mitigationTotals.totalHits = totals.totalHits;
            row.mitigationTotals.blocked = totals.blocked;
            row.mitigationTotals.evaded = totals.evaded;
            row.mitigationTotals.glanced = totals.glanced;
            row.mitigationTotals.missed = totals.missed;
            row.mitigationTotals.invulned = totals.invulned;
            row.mitigationTotals.interrupted = totals.interrupted;
            row.mitigationTotals.totalMitigation = totals.totalMitigation;
            row.mitigationTotals.minMitigation = totals.minMitigation;
        });
    };

    recomputeMitigationTotals(damageMitigationPlayersMap, mitigationCumulativeCounts);
    recomputeMitigationTotals(damageMitigationMinionsMap, mitigationMinionCumulativeCounts);

    return {
        playerStats,
        skillDamageMap,
        incomingSkillDamageMap,
        playerSkillBreakdownMap,
        outgoingCondiTotals,
        incomingCondiTotals,
        enemyProfessionCounts,
        specialBuffMeta,
        specialBuffAgg,
        specialBuffOutputAgg,
        damageMitigationPlayersMap,
        damageMitigationMinionsMap,
        mitigationCumulativeCounts,
        mitigationMinionCumulativeCounts,
        wins,
        losses,
        totalSquadSizeAccum,
        totalEnemiesAccum,
        totalSquadDeaths,
        totalSquadKills,
        totalEnemyDeaths,
        totalEnemyKills,
        totalSquadDowns,
        totalEnemyDowns,
    };
};
