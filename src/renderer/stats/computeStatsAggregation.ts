
import { applyStabilityGeneration, getPlayerCleanses, getPlayerStrips, getPlayerDownContribution, getPlayerSquadHealing, getPlayerSquadBarrier, getPlayerOutgoingCrowdControl } from "../../shared/dashboardMetrics";
import { Player } from '../../shared/dpsReportTypes';
import { buildBoonTables } from "../../shared/boonGeneration";
import { DisruptionMethod, IMvpWeights, IStatsViewSettings, DEFAULT_DISRUPTION_METHOD, DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';
import { buildConditionIconMap, computeOutgoingConditions, normalizeConditionLabel, resolveConditionNameFromEntry } from '../../shared/conditionsMetrics';
import { OFFENSE_METRICS, DEFENSE_METRICS, SUPPORT_METRICS, NON_DAMAGING_CONDITIONS } from './statsMetrics';
import { isResUtilitySkill, formatDurationMs } from './utils/dashboardUtils';
import { SkillUsageLogRecord, SkillUsagePlayer, PlayerSkillDamageEntry } from './statsTypes';
import { PROFESSION_COLORS, getProfessionColor } from '../../shared/professionUtils';

interface UseStatsAggregationProps {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeights;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
}

const parseTimestamp = (value: any): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return 0;
        return value > 1e12 ? value : value * 1000;
    }
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
    }
    const str = String(value).trim();
    if (!str) return 0;
    const numeric = Number(str);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(str);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    // Handles timezone format like "-05" by normalizing to "-05:00".
    const normalized = str.replace(/([+-]\d{2})$/, '$1:00');
    const reparsed = Date.parse(normalized);
    return Number.isFinite(reparsed) && reparsed > 0 ? reparsed : 0;
};

const resolveFightTimestamp = (details: any, log: any): number => {
    return parseTimestamp(
        details?.uploadTime
        ?? log?.uploadTime
        ?? details?.timeStartStd
        ?? details?.timeStart
        ?? details?.timeEndStd
        ?? details?.timeEnd
        ?? details?.timeStartText
        ?? details?.timeEndText
    );
};

export const computeStatsAggregation = ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }: UseStatsAggregationProps) => {

    const validLogs = (() => {
        const filtered = logs.filter(l => l.details && l.details.players && l.details.players.length > 0);
        console.log('[useStatsAggregation] Filtering logs:', {
            total: logs.length,
            passed: filtered.length,
            statuses: logs.map(l => l.status),
            hasDetails: logs.map(l => !!l.details)
        });
        return filtered;
    })();
    const activeStatsViewSettings = statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS;
    const activeMvpWeights = mvpWeights || DEFAULT_MVP_WEIGHTS;
    const enrichPrecomputedStats = (input: any) => {
        if (!input || typeof input !== 'object') return input;
        const fights = Array.isArray(input.fightBreakdown) ? input.fightBreakdown : null;
        if (!fights || fights.length === 0) return input;

        const byId = new Map<string, any>();
        const byPermalink = new Map<string, any>();
        logs.forEach((log: any) => {
            const id = log?.filePath || log?.id;
            if (id) byId.set(String(id), log);
            const link = log?.permalink || log?.details?.permalink;
            if (typeof link === 'string' && link.trim()) {
                byPermalink.set(link.trim(), log);
            }
        });

        const normalizedFights = fights.map((fight: any) => {
            if (!fight || typeof fight !== 'object') return fight;
            const hasTimestamp = Number(fight.timestamp) > 0;
            if (hasTimestamp) return fight;

            const keyId = fight.id ? String(fight.id) : '';
            const keyPermalink = typeof fight.permalink === 'string' ? fight.permalink.trim() : '';
            const matchedLog = (keyId ? byId.get(keyId) : undefined) || (keyPermalink ? byPermalink.get(keyPermalink) : undefined);
            if (!matchedLog) return fight;

            const resolved = resolveFightTimestamp(matchedLog?.details, matchedLog);
            if (!resolved) return fight;
            return { ...fight, timestamp: resolved };
        });

        return { ...input, fightBreakdown: normalizedFights };
    };

    const stats = (() => {
        if (precomputedStats) {
            return enrichPrecomputedStats(precomputedStats);
        }

        const method = disruptionMethod || DEFAULT_DISRUPTION_METHOD;
        const skillDamageSource = activeStatsViewSettings.topSkillDamageSource || 'target';
        const topSkillsMetric = activeStatsViewSettings.topSkillsMetric || 'damage';
        const total = validLogs.length;

        let wins = 0;
        let losses = 0;
        let totalSquadSizeAccum = 0;
        let totalEnemiesAccum = 0;
        let totalSquadDeaths = 0;
        let totalSquadKills = 0;
        let totalEnemyDeaths = 0;
        let totalEnemyKills = 0;

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
                    const st = targetStats?.[0];
                    if (!st) return;
                    const downed = Number(st.downed || 0);
                    const killed = Number(st.killed || 0);
                    enemyDownsDeaths += downed + killed;
                    enemyDeaths += killed;
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

        // Player Aggregation
        interface PlayerStats {
            name: string;
            account: string;
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
            supportActiveMs: number;
            supportTotals: Record<string, number>;
            healingActiveMs: number;
            healingTotals: Record<string, number>;
            profession: string;
            professions: Set<string>;
            professionList?: string[];
            professionTimeMs: Record<string, number>;
            isCommander: boolean;
            damage: number;
            dps: number;
            revives: number;
            outgoingConditions: Record<string, any>;
            incomingConditions: Record<string, any>;
        }

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
        const specialBuffAgg = new Map<string, Map<string, {
            account: string;
            profession: string;
            professions: Set<string>;
            professionTimeMs: Record<string, number>;
            totalMs: number;
            uptimeMs: number;
            durationMs: number;
        }>>();
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
        type DamageMitigationTotals = {
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
        type DamageMitigationRow = {
            account: string;
            name: string;
            profession: string;
            professionList: string[];
            activeMs: number;
            mitigationTotals: DamageMitigationTotals;
        };
        type DamageMitigationMinionRow = DamageMitigationRow & { minion: string };
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
        const hasMitigationTotals = (totals: DamageMitigationTotals) => Object.values(totals).some((value) => value > 0);

        console.log('[useStatsAggregation] Starting aggregation loop', { validLogsCount: validLogs.length });

        const resolveDamageSkillName = (skillId: number, skillMap?: Record<string, any>, buffMap?: Record<string, any>) => {
            const skillKey = `s${skillId}`;
            if (skillMap?.[skillKey]?.name) return skillMap[skillKey].name;
            if (skillMap?.[String(skillId)]?.name) return skillMap[String(skillId)].name;
            const buffKey = `b${skillId}`;
            if (buffMap?.[buffKey]?.name) return buffMap[buffKey].name;
            if (buffMap?.[String(skillId)]?.name) return buffMap[String(skillId)].name;
            return `Unknown Skill ${skillId}`;
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
        const DEBUG_MITIGATION_ACCOUNT = 'Ashtonlightstone.9145';
        const DEBUG_MITIGATION_MINION = 'Illusionary Warden';
        const debugMitigationRows: Array<Record<string, any>> = [];
        const debugMitigationSummary: Array<Record<string, any>> = [];
        const debugPlayerMitigationRows: Array<Record<string, any>> = [];
        const debugPlayerMitigationSummary: Array<Record<string, any>> = [];
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

        validLogs.forEach((log, logIndex) => {
            const details = log.details;
            if (!details) return;
            const players = details.players as unknown as Player[];
            console.log(`[useStatsAggregation] Processing log ${logIndex}:`, {
                playerCount: players?.length,
                hasTargets: !!details.targets,
                firstPlayer: players?.[0] ? { account: players[0].account, notInSquad: players[0].notInSquad } : 'none'
            });
            const targets = details.targets || [];
            const damageSkillMap = details.skillMap || {};
            const damageBuffMap = details.buffMap || {};
            const localEnemyById = new Map<number, { totalDamage: number; connectedHits: number; minTotal: number; minCount: number }>();
            const localEnemyByName = new Map<string, { totalDamage: number; connectedHits: number; minTotal: number; minCount: number }>();
            targets.forEach((target: any) => {
                const dist = target?.totalDamageDist || [];
                const list = Array.isArray(dist) ? dist[0] : null;
                list?.forEach((entry: any) => {
                    if (!entry?.id) return;
                    const skillId = Number(entry.id);
                    const keyName = (damageSkillMap?.[skillId]?.name || entry.name || entry.skillName || String(skillId)) as string;
                    const localId = localEnemyById.get(skillId) || { totalDamage: 0, connectedHits: 0, minTotal: 0, minCount: 0 };
                    localId.totalDamage += Number(entry.totalDamage || 0);
                    localId.connectedHits += Number(entry.connectedHits || 0);
                    const minValueId = Number.isFinite(Number(entry.min)) ? Number(entry.min) : 0;
                    localId.minTotal += minValueId;
                    localId.minCount += 1;
                    localEnemyById.set(skillId, localId);

                    const localName = localEnemyByName.get(keyName) || { totalDamage: 0, connectedHits: 0, minTotal: 0, minCount: 0 };
                    localName.totalDamage += Number(entry.totalDamage || 0);
                    localName.connectedHits += Number(entry.connectedHits || 0);
                    const minValueName = Number.isFinite(Number(entry.min)) ? Number(entry.min) : 0;
                    localName.minTotal += minValueName;
                    localName.minCount += 1;
                    localEnemyByName.set(keyName, localName);
                });
            });
            const resolveLocalAvgById = (skillId: number) => {
                const bucket = localEnemyById.get(skillId);
                if (!bucket || bucket.connectedHits <= 0) return { avg: 1, min: 1 };
                const avg = bucket.connectedHits > 0 ? bucket.totalDamage / bucket.connectedHits : 0;
                const min = bucket.minCount > 0 ? bucket.minTotal / bucket.minCount : avg;
                return { avg: avg || 1, min: min || 1 };
            };
            const resolveLocalAvgByName = (skillName: string) => {
                const bucket = localEnemyByName.get(skillName);
                if (!bucket || bucket.connectedHits <= 0) return { avg: 1, min: 1 };
                const avg = bucket.connectedHits > 0 ? bucket.totalDamage / bucket.connectedHits : 0;
                const min = bucket.minCount > 0 ? bucket.minTotal / bucket.minCount : avg;
                return { avg: avg || 1, min: min || 1 };
            };

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

            const squadPlayers = players.filter(p => !p.notInSquad);
            totalSquadSizeAccum += squadPlayers.length;
            totalEnemiesAccum += targets.filter((t: any) => !t.isFake).length;

            applyStabilityGeneration(players, { durationMS: details.durationMS, buffMap: details.buffMap });

            const { squadDeaths, enemyDeaths } = getFightDownsDeaths(details);
            totalSquadDeaths += squadDeaths;
            totalSquadKills += enemyDeaths;
            totalEnemyKills += squadDeaths;
            totalEnemyDeaths += enemyDeaths;

            const isWin = getFightOutcome(details);
            if (isWin) wins++; else losses++;

            const battleStandardSkillId = details.skillMap
                ? Number(Object.keys(details.skillMap).find((key) => details.skillMap?.[key]?.name === 'Battle Standard')?.replace(/^s/, ''))
                : null;

            players.forEach((p, playerIndex) => {
                if (p.notInSquad) return;
                const account = p.account || 'Unknown';
                const key = account !== 'Unknown' ? account : (p.name || 'Unknown');
                const name = p.name || 'Unknown';

                if (!playerStats.has(key)) {
                    playerStats.set(key, {
                        name, account: key, downContrib: 0, cleanses: 0, strips: 0, stab: 0, healing: 0, barrier: 0, cc: 0, logsJoined: 0,
                        totalDist: 0, distCount: 0, dodges: 0, downs: 0, deaths: 0, totalFightMs: 0,
                        offenseTotals: {}, offenseRateWeights: {}, defenseActiveMs: 0, defenseTotals: {}, supportActiveMs: 0, supportTotals: {},
                        healingActiveMs: 0, healingTotals: {}, profession: p.profession || 'Unknown', professions: new Set(),
                        professionTimeMs: {}, isCommander: false, damage: 0, dps: 0, revives: 0, outgoingConditions: {}, incomingConditions: {}
                    });
                }
                const s = playerStats.get(key)!;
                if (p.hasCommanderTag) s.isCommander = true;
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

                        if (!specialBuffAgg.has(buffId)) {
                            specialBuffAgg.set(buffId, new Map());
                        }
                        const bucket = specialBuffAgg.get(buffId)!;
                        const account = s.account || p.account || p.name || 'Unknown';
                        let agg = bucket.get(account);
                        if (!agg) {
                            agg = {
                                account,
                                profession: s.profession || p.profession || 'Unknown',
                                professions: new Set<string>(),
                                professionTimeMs: {},
                                totalMs: 0,
                                uptimeMs: 0,
                                durationMs: 0
                            };
                            bucket.set(account, agg);
                        }
                        const prof = p.profession || s.profession;
                        if (prof && prof !== 'Unknown') {
                            agg.professions.add(prof);
                            agg.professionTimeMs[prof] = (agg.professionTimeMs[prof] || 0) + activeMs;
                            agg.profession = prof;
                        }
                        agg.totalMs += hasTotalMs ? totalMs : 0;
                        agg.uptimeMs += hasUptimeMs ? uptimeMs : 0;
                        agg.durationMs += activeMs;
                    });
                }

                if (p.defenses?.[0]) {
                    DEFENSE_METRICS.forEach(m => {
                        const val = Number((p.defenses![0] as any)[m.field!] ?? 0);
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
                    if (m.id === 'downContributionPercent') return;
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
                    if (name.startsWith('Skill ')) {
                        const conditionName = resolveConditionNameFromEntry(name, entry.id, details.buffMap);
                        if (conditionName) {
                            name = conditionName;
                            icon = details.buffMap?.[`b${entry.id}`]?.icon || icon;
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
                            if (name.startsWith('Skill ')) {
                                const conditionName = resolveConditionNameFromEntry(name, entry.id, details.buffMap);
                                if (conditionName) {
                                    name = conditionName;
                                    icon = details.buffMap?.[`b${entry.id}`]?.icon || icon;
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
                getPlayerKey: (pl: any) => (pl.account && pl.account !== 'Unknown') ? pl.account : (pl.name || null)
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
                const key = (p.account && p.account !== 'Unknown') ? p.account : (p.name || 'Unknown');
                const ps = playerStats.get(key);
                if (!ps || !p.totalDamageTaken) return;
                p.totalDamageTaken.forEach((list: any) => list?.forEach((entry: any) => {
                    if (!entry?.id) return;
                    let sName = `Skill ${entry.id}`;
                    const sm = details.skillMap?.[`s${entry.id}`] || details.skillMap?.[`${entry.id}`];
                    if (sm?.name) sName = sm.name;
                    const finalName = resolveConditionNameFromEntry(sName, entry.id, details.buffMap);
                    if (!finalName) return;
                    const buffName = details.buffMap?.[`b${entry.id}`]?.name;
                    const conditionIcon = conditionIconMap.get(finalName) || details.buffMap?.[`b${entry.id}`]?.icon;
                    const skillIcon = sm?.icon || conditionIcon;
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
                    const row = ensureMitigationRow(damageMitigationPlayersMap, base.account, base);
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
                    Object.entries(minionMap as any).forEach(([minionName, skillMap]) => {
                        if (!skillMap || typeof skillMap !== 'object') return;
                        const rowKey = `${base.account}::${minionName}`;
                        const row = ensureMitigationMinionRow(damageMitigationMinionsMap, rowKey, {
                            ...base,
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
                        const account = player.account || player.name || 'Unknown';
                        const base = {
                            account,
                            name: player.name || account,
                            profession: resolveProfessionLabel(player.profession || 'Unknown')
                        };
                        ensureMitigationRow(damageMitigationPlayersMap, account, base);
                        const skillMap = details.skillMap || {};
                        const buffMap = details.buffMap || {};
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
                            const skillName = resolveDamageSkillName(skillId, skillMap, buffMap);
                            updateCumulativeCounts(
                                mitigationCumulativeCounts,
                                `${account}::${skillId}`,
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

                            if (account === DEBUG_MITIGATION_ACCOUNT) {
                                const bucket = globalEnemySkillStats.get(skillId);
                                const enemy = resolveGlobalEnemyStats(skillId);
                                const avg = enemy.hasSkill ? (enemy.hits > 0 ? enemy.avg : 0) : 1;
                                const min = enemy.hasSkill ? (enemy.min || 0) : 1;
                                const avoidDamage = enemy.hits > 0
                                    ? glanced * avg / 2 + (blocked + evaded + missed + invulned + interrupted) * avg
                                    : 0;
                                const avoidMinDamage = enemy.hits > 0
                                    ? glanced * min / 2 + (blocked + evaded + missed + invulned + interrupted) * min
                                    : 0;
                                debugPlayerMitigationRows.push({
                                    logId: log.filePath || log.id || logIndex,
                                    skillId: entry.id,
                                    skillName,
                                    blocked,
                                    evaded,
                                    glanced,
                                    missed,
                                    invulned,
                                    interrupted,
                                    totalAvoids: blocked + evaded + glanced + missed + invulned + interrupted,
                                    avg,
                                    min,
                                    enemyHits: bucket?.connectedHits ?? 0,
                                    enemyTotalDmg: bucket?.totalDamage ?? 0,
                                    avoidDmg: avoidDamage,
                                    avoidMinDmg: avoidMinDamage
                                });
                            }
                        });

                        if (account === DEBUG_MITIGATION_ACCOUNT) {
                            const computeTotals = (entriesList: any[] | null | undefined, avgResolver: (skillId: number, skillName: string) => { avg: number; min: number; hits?: number }) => {
                                let total = 0;
                                let minTotal = 0;
                                let hits = 0;
                                if (!Array.isArray(entriesList)) return { total, minTotal, hits };
                                for (const entry of entriesList) {
                                    if (!entry?.id) continue;
                                    const blocked = readNumber(entry.blocked);
                                    const evaded = readNumber(entry.evaded);
                                    const glanced = readNumber(entry.glance ?? entry.glanced);
                                    const missed = readNumber(entry.missed);
                                    const invulned = readNumber(entry.invulned);
                                    const interrupted = readNumber(entry.interrupted);
                                    const skillName = resolveDamageSkillName(Number(entry.id), damageSkillMap, damageBuffMap);
                                    const avgInfo = avgResolver(Number(entry.id), skillName);
                                    if ((avgInfo.hits ?? 0) > 0) {
                                        total += glanced * avgInfo.avg / 2 + (blocked + evaded + missed + invulned + interrupted) * avgInfo.avg;
                                        minTotal += glanced * avgInfo.min / 2 + (blocked + evaded + missed + invulned + interrupted) * avgInfo.min;
                                    }
                                    hits += readNumber(entry.hits ?? entry.connectedHits);
                                }
                                return { total, minTotal, hits };
                            };
                            debugPlayerMitigationSummary.push({
                                logId: log.filePath || log.id || logIndex,
                                variant: 'current_global_name_taken0',
                                ...computeTotals(list, (_id, _name) => {
                                    const enemy = resolveGlobalEnemyStats(_id);
                                    const avg = enemy.hasSkill ? (enemy.hits > 0 ? enemy.avg : 0) : 1;
                                    const min = enemy.hasSkill ? (enemy.min || 0) : 1;
                                    return { avg, min, hits: enemy.hits };
                                })
                            });
                        }
                    });
                }

                if (!hasMitigationMinionSource) {
                    squadPlayers.forEach((player: any) => {
                        const minions = player?.minions || [];
                        if (!Array.isArray(minions) || minions.length === 0) return;
                        const account = player.account || player.name || 'Unknown';
                        const base = {
                            account,
                            name: player.name || account,
                            profession: resolveProfessionLabel(player.profession || 'Unknown')
                        };
                        const skillMap = details.skillMap || {};
                        const buffMap = details.buffMap || {};
                        minions.forEach((minion: any) => {
                            const minionEntries = minion?.totalDamageTakenDist || [];
                            if (!Array.isArray(minionEntries) || minionEntries.length === 0) return;
                            let minionName = String(minion?.name || 'Unknown').replace(/^Juvenile\s+/i, '') || 'Unknown';
                            if (minionName.toUpperCase().includes('UNKNOWN')) minionName = 'Unknown';
                            const rowKey = `${account}::${minionName}`;
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
                                const skillName = resolveDamageSkillName(skillId, skillMap, buffMap);
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

                                if (account === DEBUG_MITIGATION_ACCOUNT && minionName === DEBUG_MITIGATION_MINION) {
                                    const bucket = globalEnemySkillStats.get(skillId);
                                    const enemy = resolveGlobalEnemyStats(skillId);
                                    const avg = enemy.hasSkill ? (enemy.hits > 0 ? enemy.avg : 0) : 1;
                                    const min = enemy.hasSkill ? (enemy.min || 0) : 1;
                                    const avoidDamage = enemy.hits > 0
                                        ? glanced * avg / 2 + (blocked + evaded + missed + invulned + interrupted) * avg
                                        : 0;
                                    const avoidMinDamage = enemy.hits > 0
                                        ? glanced * min / 2 + (blocked + evaded + missed + invulned + interrupted) * min
                                        : 0;
                                    debugMitigationRows.push({
                                        logId: log.filePath || log.id || logIndex,
                                        skillId: entry.id,
                                        skillName,
                                        blocked,
                                        evaded,
                                        glanced,
                                        missed,
                                        invulned,
                                        interrupted,
                                        totalAvoids: blocked + evaded + glanced + missed + invulned + interrupted,
                                        avg,
                                        min,
                                        enemyHits: bucket?.connectedHits ?? 0,
                                        enemyTotalDmg: bucket?.totalDamage ?? 0,
                                        avoidDmg: avoidDamage,
                                        avoidMinDmg: avoidMinDamage
                                    });
                                }
                            });

                            if (account === DEBUG_MITIGATION_ACCOUNT && minionName === DEBUG_MITIGATION_MINION) {
                                const computeTotals = (entries: any[] | null | undefined, avgResolver: (skillId: number, skillName: string) => { avg: number; min: number }) => {
                                    let total = 0;
                                    let minTotal = 0;
                                    let hits = 0;
                                    if (!Array.isArray(entries)) return { total, minTotal, hits };
                                    for (const entry of entries) {
                                        if (!entry?.id) continue;
                                        const blocked = readNumber(entry.blocked);
                                        const evaded = readNumber(entry.evaded);
                                        const glanced = readNumber(entry.glance ?? entry.glanced);
                                        const missed = readNumber(entry.missed);
                                        const invulned = readNumber(entry.invulned);
                                        const interrupted = readNumber(entry.interrupted);
                                        const skillName = resolveDamageSkillName(Number(entry.id), damageSkillMap, damageBuffMap);
                                        const { avg, min } = avgResolver(Number(entry.id), skillName);
                                        if (readNumber(entry.hits ?? entry.connectedHits) > 0) {
                                            total += glanced * avg / 2 + (blocked + evaded + missed + invulned + interrupted) * avg;
                                            minTotal += glanced * min / 2 + (blocked + evaded + missed + invulned + interrupted) * min;
                                        }
                                        hits += readNumber(entry.hits ?? entry.connectedHits);
                                    }
                                    return { total, minTotal, hits };
                                };
                                const entriesDist = Array.isArray(minionEntries) ? (minionEntries[0] || []) : [];
                                const entriesAll = Array.isArray(minionEntries) ? minionEntries.flat() : [];
                                const entriesTaken = Array.isArray(minion?.totalDamageTaken) ? (minion.totalDamageTaken[0] || []) : [];

                                debugMitigationSummary.push({
                                    logId: log.filePath || log.id || logIndex,
                                    variant: 'current_global_name_dist0',
                                    ...computeTotals(entriesDist, (_id, _name) => {
                                        const enemy = resolveGlobalEnemyStats(_id);
                                        const avg = enemy.hasSkill ? (enemy.hits > 0 ? enemy.avg : 0) : 1;
                                        const min = enemy.hasSkill ? (enemy.min || 0) : 0;
                                        return { avg, min };
                                    })
                                });
                                debugMitigationSummary.push({
                                    logId: log.filePath || log.id || logIndex,
                                    variant: 'local_name_dist0',
                                    ...computeTotals(entriesDist, (_id, name) => resolveLocalAvgByName(name))
                                });
                                debugMitigationSummary.push({
                                    logId: log.filePath || log.id || logIndex,
                                    variant: 'local_id_dist0',
                                    ...computeTotals(entriesDist, (id) => resolveLocalAvgById(id))
                                });
                                debugMitigationSummary.push({
                                    logId: log.filePath || log.id || logIndex,
                                    variant: 'global_name_alllists',
                                    ...computeTotals(entriesAll, (_id, _name) => {
                                        const enemy = resolveGlobalEnemyStats(_id);
                                        const avg = enemy.hasSkill ? (enemy.hits > 0 ? enemy.avg : 0) : 1;
                                        const min = enemy.hasSkill ? (enemy.min || 0) : 0;
                                        return { avg, min };
                                    })
                                });
                                debugMitigationSummary.push({
                                    logId: log.filePath || log.id || logIndex,
                                    variant: 'global_name_taken0',
                                    ...computeTotals(entriesTaken, (_id, _name) => {
                                        const enemy = resolveGlobalEnemyStats(_id);
                                        const avg = enemy.hasSkill ? (enemy.hits > 0 ? enemy.avg : 0) : 1;
                                        const min = enemy.hasSkill ? (enemy.min || 0) : 0;
                                        return { avg, min };
                                    })
                                });
                            }
                        });
                    });
                }
            }

        }); // End Logs Loop

        if (debugMitigationRows.length > 0) {
            console.groupCollapsed('[Mitigation Debug] Ashtonlightstone.9145 / Illusionary Warden');
            console.table(debugMitigationRows);
            if (debugMitigationSummary.length > 0) {
                console.table(debugMitigationSummary);
            }
            console.groupEnd();
        }
        if (debugPlayerMitigationRows.length > 0) {
            console.groupCollapsed('[Mitigation Debug] Ashtonlightstone.9145 / Player');
            console.table(debugPlayerMitigationRows);
            if (debugPlayerMitigationSummary.length > 0) {
                console.table(debugPlayerMitigationSummary);
            }
            console.groupEnd();
        }

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

        // Post-Processing
        const avgSquadSize = total > 0 ? Math.round(totalSquadSizeAccum / total) : 0;
        const avgEnemies = total > 0 ? Math.round(totalEnemiesAccum / total) : 0;
        const squadKDR = totalSquadDeaths > 0 ? (totalSquadKills / totalSquadDeaths).toFixed(2) : totalSquadKills > 0 ? '∞' : '0.00';
        const enemyKDR = totalEnemyDeaths > 0 ? (totalEnemyKills / totalEnemyDeaths).toFixed(2) : totalEnemyKills > 0 ? '∞' : '0.00';

        const buildLeaderboard = (items: Array<{ account: string; profession: string; professionList?: string[]; value: number; count?: number }>, higherIsBetter: boolean) => {
            const filtered = items.filter(item => Number.isFinite(item.value) && (higherIsBetter ? item.value > 0 : item.value >= 0));
            const sorted = filtered.sort((a, b) => {
                const diff = higherIsBetter ? b.value - a.value : a.value - b.value;
                return diff !== 0 ? diff : a.account.localeCompare(b.account);
            });
            let lastValue: number | null = null;
            let lastRank = 0;
            return sorted.map((item, index) => {
                if (lastValue === null || item.value !== lastValue) {
                    lastRank = index + 1;
                    lastValue = item.value;
                }
                return { rank: lastRank, ...item };
            });
        };

        const playerEntries = Array.from(playerStats.values()).map(stat => {
            // resolve primary profession
            const list = Array.from(stat.professions).filter(p => p !== 'Unknown');
            stat.professionList = list;
            if (list.length > 0) {
                let primary = list[0];
                let maxTime = stat.professionTimeMs[primary] || 0;
                list.forEach(prof => {
                    const t = stat.professionTimeMs[prof] || 0;
                    if (t > maxTime) { maxTime = t; primary = prof; }
                });
                stat.profession = primary;
            }
            return { key: stat.account, stat };
        });

        const hydrateMitigationRow = <T extends DamageMitigationRow>(row: T): T => {
            const stat = playerStats.get(row.account);
            if (!stat) {
                const fallbackList = row.professionList.length > 0 ? row.professionList : (row.profession ? [row.profession] : []);
                return { ...row, professionList: fallbackList };
            }
            const professionList = stat.professionList && stat.professionList.length > 0
                ? stat.professionList
                : Array.from(stat.professions || []).filter((prof) => prof && prof !== 'Unknown');
            const resolvedProfession = stat.profession || row.profession;
            return {
                ...row,
                profession: resolvedProfession,
                professionList: professionList.length > 0 ? professionList : (resolvedProfession ? [resolvedProfession] : []),
                activeMs: stat.defenseActiveMs || stat.totalFightMs || row.activeMs
            };
        };

        const damageMitigationPlayers = Array.from(damageMitigationPlayersMap.values())
            .map(hydrateMitigationRow)
            .filter((row) => hasMitigationTotals(row.mitigationTotals))
            .sort((a, b) => a.account.localeCompare(b.account));
        const damageMitigationMinions = Array.from(damageMitigationMinionsMap.values())
            .map(hydrateMitigationRow)
            .filter((row) => row.mitigationTotals.totalMitigation > 0)
            .sort((a, b) => {
                const accountSort = a.account.localeCompare(b.account);
                if (accountSort !== 0) return accountSort;
                return String(a.minion || '').localeCompare(String(b.minion || ''));
            });

        // Simplified leaderboards construction
        const getVal = (s: PlayerStats, k: string) => {
            switch (k) {
                case 'downContrib': return s.downContrib;
                case 'barrier': return s.barrier;
                case 'healing': return s.healing;
                case 'dodges': return s.dodges;
                case 'strips': return s.strips;
                case 'cleanses': return s.cleanses;
                case 'cc': return s.cc;
                case 'stability': return s.stab;
                case 'revives': return s.revives;
                case 'dps': return s.dps;
                case 'damage': return s.damage;
                case 'participation': return s.logsJoined;
                case 'closestToTag': return (!s.isCommander && s.distCount > 0) ? s.totalDist / s.distCount : Number.POSITIVE_INFINITY;
                default: return 0;
            }
        };

        const createLB = (k: string, higher: boolean) => buildLeaderboard(playerEntries.map(({ stat }) => ({
            account: stat.account, profession: stat.profession, professionList: stat.professionList, value: getVal(stat, k), count: stat.logsJoined
        })), higher);

        const leaderboards = {
            downContrib: createLB('downContrib', true),
            barrier: createLB('barrier', true),
            healing: createLB('healing', true),
            dodges: createLB('dodges', true),
            strips: createLB('strips', true),
            cleanses: createLB('cleanses', true),
            cc: createLB('cc', true),
            stability: createLB('stability', true),
            revives: createLB('revives', true),
            participation: createLB('participation', true),
            dps: createLB('dps', true),
            damage: createLB('damage', true),
            closestToTag: createLB('closestToTag', false).filter(i => Number.isFinite(i.value))
        };

        const statKeys = {
            downContrib: 'downContrib',
            barrier: 'barrier',
            healing: 'healing',
            dodges: 'dodges',
            strips: 'strips',
            cleanses: 'cleanses',
            cc: 'cc',
            stability: 'stability',
            closestToTag: 'closestToTag'
        } as const;

        const getTopFromLeaderboard = (rows: any[]) => {
            const entry = rows?.[0];
            return {
                value: entry?.value ?? 0,
                player: entry?.account ?? '-',
                count: entry?.count ?? 0,
                profession: entry?.profession ?? 'Unknown',
                professionList: entry?.professionList ?? []
            };
        };

        const topStatsPerSecond: any = {
            maxDownContrib: getTopFromLeaderboard([]),
            maxBarrier: getTopFromLeaderboard([]),
            maxHealing: getTopFromLeaderboard([]),
            maxDodges: getTopFromLeaderboard([]),
            maxStrips: getTopFromLeaderboard([]),
            maxCleanses: getTopFromLeaderboard([]),
            maxCC: getTopFromLeaderboard([]),
            maxStab: getTopFromLeaderboard([]),
            closestToTag: getTopFromLeaderboard([])
        };

        const perSecondLeaderboards: Record<string, any[]> = {};
        const getPerSecondVal = (s: PlayerStats, k: string) => {
            if (k === 'closestToTag') return getVal(s, k);
            const seconds = Math.max(1, (s.totalFightMs || 0) / 1000);
            return getVal(s, k) / seconds;
        };
        Object.values(statKeys).forEach((k) => {
            const higherIsBetter = k !== 'closestToTag';
            perSecondLeaderboards[k] = buildLeaderboard(playerEntries.map(({ stat }) => ({
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: getPerSecondVal(stat, k),
                count: stat.logsJoined
            })), higherIsBetter);
        });

        topStatsPerSecond.maxDownContrib = getTopFromLeaderboard(perSecondLeaderboards.downContrib);
        topStatsPerSecond.maxBarrier = getTopFromLeaderboard(perSecondLeaderboards.barrier);
        topStatsPerSecond.maxHealing = getTopFromLeaderboard(perSecondLeaderboards.healing);
        topStatsPerSecond.maxDodges = getTopFromLeaderboard(perSecondLeaderboards.dodges);
        topStatsPerSecond.maxStrips = getTopFromLeaderboard(perSecondLeaderboards.strips);
        topStatsPerSecond.maxCleanses = getTopFromLeaderboard(perSecondLeaderboards.cleanses);
        topStatsPerSecond.maxCC = getTopFromLeaderboard(perSecondLeaderboards.cc);
        topStatsPerSecond.maxStab = getTopFromLeaderboard(perSecondLeaderboards.stability);
        topStatsPerSecond.closestToTag = getTopFromLeaderboard(perSecondLeaderboards.closestToTag);

        const topStats = {
            maxDownContrib: getTopFromLeaderboard(leaderboards.downContrib),
            maxBarrier: getTopFromLeaderboard(leaderboards.barrier),
            maxHealing: getTopFromLeaderboard(leaderboards.healing),
            maxDodges: getTopFromLeaderboard(leaderboards.dodges),
            maxStrips: getTopFromLeaderboard(leaderboards.strips),
            maxCleanses: getTopFromLeaderboard(leaderboards.cleanses),
            maxCC: getTopFromLeaderboard(leaderboards.cc),
            maxStab: getTopFromLeaderboard(leaderboards.stability),
            closestToTag: getTopFromLeaderboard(leaderboards.closestToTag)
        };

        // MVP Calculation
        let mvp = { player: 'None', account: 'None', score: -1, profession: 'Unknown', professionList: [] as string[], color: '#64748b', topStats: [] as any[] };
        let silver: any = undefined;
        let bronze: any = undefined;
        let avgMvpScore = 0;

        if (activeStatsViewSettings?.showMvp) {
            const mvpWeightKeyByName: Record<string, keyof IMvpWeights> = {
                'Down Contribution': 'downContribution',
                'Healing': 'healing',
                'Cleanses': 'cleanses',
                'Strips': 'strips',
                'Stability': 'stability',
                'CC': 'cc',
                'Revives': 'revives',
                'Distance to Tag': 'distanceToTag',
                'Participation': 'participation',
                'Dodging': 'dodging',
                'DPS': 'dps',
                'Damage': 'damage'
            };
            const isMvpMetricEnabled = (name: string) => {
                const key = mvpWeightKeyByName[name];
                if (!key) return false;
                return Number(activeMvpWeights[key] || 0) > 0;
            };
            const scores: any[] = [];
            const buildTopStats = (contribs: any[]) =>
                [...(contribs || [])]
                    .filter((entry) => isMvpMetricEnabled(entry?.name))
                    .sort((a, b) => b.ratio - a.ratio || a.rank - b.rank || a.name.localeCompare(b.name))
                    .slice(0, 3);

            const enrichPlacement = (entry: any) => {
                if (!entry) return undefined;
                const topStats = buildTopStats(entry.contribs);
                return {
                    ...entry,
                    player: entry.name,
                    reason: topStats[0]?.name || 'Top Performance',
                    topStats
                };
            };

            playerEntries.forEach(({ stat }) => {
                let score = 0;
                const contribs: any[] = [];
                const check = (val: number, lb: any[], weight: number, name: string, higher = true) => {
                    if (weight <= 0) return;
                    const best = lb[0]?.value || 0;
                    if (!best) return;
                    if (!Number.isFinite(val)) return;
                    if (higher ? val > 0 : val < Number.POSITIVE_INFINITY) {
                        const ratio = higher ? val / best : best / val; // Approximation since we don't have max value handy without LB 0
                        score += ratio * weight;
                        const rank = lb.find((r: any) => r.account === stat.account)?.rank || 0;
                        contribs.push({ name, ratio, val: val.toLocaleString(), rank });
                    }
                };
                // Check against leaderboards
                check(stat.downContrib, leaderboards.downContrib, activeMvpWeights.downContribution, 'Down Contribution');
                check(stat.healing, leaderboards.healing, activeMvpWeights.healing, 'Healing');
                check(stat.cleanses, leaderboards.cleanses, activeMvpWeights.cleanses, 'Cleanses');
                check(stat.strips, leaderboards.strips, activeMvpWeights.strips, 'Strips');
                check(stat.stab, leaderboards.stability, activeMvpWeights.stability, 'Stability');
                check(stat.cc, leaderboards.cc, activeMvpWeights.cc, 'CC');
                check(stat.revives, leaderboards.revives, activeMvpWeights.revives, 'Revives');
                check(getVal(stat, 'closestToTag'), leaderboards.closestToTag, activeMvpWeights.distanceToTag, 'Distance to Tag', false);
                check(stat.logsJoined, leaderboards.participation, activeMvpWeights.participation, 'Participation');
                check(stat.dodges, leaderboards.dodges, activeMvpWeights.dodging, 'Dodging');
                check(stat.dps, leaderboards.dps, activeMvpWeights.dps, 'DPS');
                check(stat.damage, leaderboards.damage, activeMvpWeights.damage, 'Damage');
                scores.push({ ...stat, score, contribs: contribs.filter((entry) => isMvpMetricEnabled(entry.name)) });
            });
            scores.sort((a, b) => b.score - a.score);
            if (scores[0] && scores[0].score > 0) {
                mvp = enrichPlacement(scores[0]) || mvp;
            }
            silver = enrichPlacement(scores[1]);
            bronze = enrichPlacement(scores[2]);

            avgMvpScore = scores.length > 0
                ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
                : 0;
        }

        const topSkills = Object.values(skillDamageMap)
            .sort((a, b) => {
                const aVal = topSkillsMetric === 'downContribution' ? a.downContribution : a.damage;
                const bVal = topSkillsMetric === 'downContribution' ? b.downContribution : b.damage;
                return bVal - aVal;
            })
            .slice(0, 25);
        const topIncomingSkills = Object.values(incomingSkillDamageMap).sort((a, b) => b.damage - a.damage).slice(0, 25);

        // Map Data
        const normalizeMapLabel = (value: any) => {
            if (!value) return 'Unknown';
            const cleaned = String(value)
                .replace(/^Detailed\s*WvW\s*-\s*/i, '')
                .replace(/^World\s*vs\s*World\s*-\s*/i, '')
                .replace(/^WvW\s*-\s*/i, '')
                .trim();
            const borderlandsMatch = cleaned.match(/^(Red|Blue|Green)\s+(?:Alpine|Desert)?\s*Borderlands$/i);
            if (borderlandsMatch) {
                return `${borderlandsMatch[1]} Borderlands`;
            }
            return cleaned || 'Unknown';
        };
        const resolveMapName = (details: any, log: any) => {
            return normalizeMapLabel(
                details?.zone
                || details?.mapName
                || details?.map
                || details?.location
                || details?.fightName
                || log?.fightName
                || log?.encounterName
                || 'Unknown'
            );
        };
        const resolvePermalink = (details: any, log: any) => {
            const direct = log?.permalink || details?.permalink;
            if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
            const uploadLinks = details?.uploadLinks;
            if (!Array.isArray(uploadLinks)) return '';
            for (const entry of uploadLinks) {
                if (typeof entry === 'string' && entry.trim().length > 0) return entry.trim();
                if (entry && typeof entry === 'object') {
                    const candidate = entry.permalink || entry.link || entry.url || entry.reportLink;
                    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
                }
            }
            return '';
        };
        const mapCounts: Record<string, number> = {};
        validLogs.forEach((log) => {
            const name = resolveMapName(log?.details, log);
            mapCounts[name] = (mapCounts[name] || 0) + 1;
        });
        const mapData = Object.entries(mapCounts)
            .map(([name, value]) => {
                const label = String(name).trim();
                const isEbg = /eternal battlegrounds|^ebg$/i.test(label);
                let color = '#64748b';
                if (isEbg) {
                    color = '#ffffff';
                } else if (/red/i.test(label)) {
                    color = '#ef4444';
                } else if (/blue/i.test(label)) {
                    color = '#3b82f6';
                } else if (/green/i.test(label)) {
                    color = '#22c55e';
                }
                return { name, value, color };
            })
            .sort((a, b) => b.value - a.value);

        const { boonTables } = buildBoonTables(validLogs);

        const timelineData = validLogs.map((log, i) => {
            const players = (log.details?.players as any[]) || [];
            return {
            index: i + 1,
            label: `Log ${i + 1}`,
            timestamp: resolveFightTimestamp(log.details, log),
            squadCount: players.filter(p => !p.notInSquad).length,
            friendlyCount: players.length,
            enemies: (log.details?.targets as any[]).filter(t => !t.isFake).length
            };
        }).sort((a, b) => a.timestamp - b.timestamp);

        // 1. Squad Class Data
        const squadClassCounts: Record<string, number> = {};
        Array.from(playerStats.values()).forEach(p => {
            if (p.profession && p.profession !== 'Unknown') {
                squadClassCounts[p.profession] = (squadClassCounts[p.profession] || 0) + 1;
            }
        });
        const squadClassData = Object.entries(squadClassCounts).map(([name, value]) => ({
            name, value, color: getProfessionColor(name)
        })).sort((a, b) => b.value - a.value);

        // 2. Enemy Class Data
        const enemyNameCounts: Record<string, number> = {};
        if (Object.keys(enemyProfessionCounts).length === 0) {
            validLogs.forEach(l => {
                l.details?.targets?.forEach((t: any) => {
                    if (t.isFake) return;
                    const rawName = (t.profession && t.profession !== 'Unknown') ? t.profession : (t.name || t.id || 'Unknown');
                    const name = resolveProfessionLabel(rawName);
                    enemyNameCounts[name] = (enemyNameCounts[name] || 0) + 1;
                });
            });
        }
        const enemyCounts = Object.keys(enemyProfessionCounts).length > 0 ? enemyProfessionCounts : enemyNameCounts;
        const enemyClassData = Object.entries(enemyCounts).map(([name, value]) => ({
            name, value, color: getProfessionColor(name) || '#f87171'
        })).sort((a, b) => b.value - a.value);

        // 3. Fight Breakdown
        const fightBreakdown = validLogs
            .map((log, originalIndex) => { return { log, originalIndex }; })
            .sort((a, b) => resolveFightTimestamp(a.log.details, a.log) - resolveFightTimestamp(b.log.details, b.log))
            .map(({ log }, idx) => {
                const details = log.details;
                if (!details) return null;
                const players = details.players || [];
                const squadPlayers = players.filter((p: any) => !p.notInSquad);
                const allies = players.filter((p: any) => p.notInSquad);
                const targets = details.targets || [];
                const enemyTargets = targets.filter((t: any) => !t.isFake);
                const totalOutgoing = squadPlayers.reduce((sum: number, p: any) => sum + (p.dpsAll?.[0]?.damage || 0), 0);
                const totalIncoming = squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.damageTaken || 0), 0);
                const { enemyDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
                const isWin = getFightOutcome(details);
                const timestamp = resolveFightTimestamp(details, log);
                const mapName = resolveMapName(details, log);
                const teamCounts = { red: 0, green: 0, blue: 0 };
                const toFiniteNumber = (value: any) => {
                    const n = Number(value);
                    return Number.isFinite(n) ? n : 0;
                };
                const getTeamValue = (entity: any) => {
                    if (!entity || typeof entity !== 'object') return undefined;
                    const direct = entity.teamID ?? entity.teamId ?? entity.team ?? entity.teamColor ?? entity.team_color;
                    if (direct !== undefined && direct !== null) return direct;
                    const key = Object.keys(entity).find((k) => /^team/i.test(k));
                    return key ? entity[key] : undefined;
                };
                const normalizeTeam = (value: any, mode: 'zeroBased' | 'oneBased'): 'red' | 'green' | 'blue' | null => {
                    if (value === undefined || value === null) return null;
                    if (typeof value === 'string') {
                        const lower = value.toLowerCase();
                        if (lower.includes('red')) return 'red';
                        if (lower.includes('green')) return 'green';
                        if (lower.includes('blue')) return 'blue';
                        if (lower === 'r') return 'red';
                        if (lower === 'g') return 'green';
                        if (lower === 'b') return 'blue';
                        return null;
                    }
                    if (typeof value === 'number') {
                        if (mode === 'zeroBased') {
                            if (value === 0) return 'red';
                            if (value === 1) return 'green';
                            if (value === 2) return 'blue';
                        } else {
                            if (value === 1) return 'red';
                            if (value === 2) return 'green';
                            if (value === 3) return 'blue';
                        }
                    }
                    return null;
                };
                const countProfessions = (entries: any[], getRaw: (entry: any) => string | undefined) => {
                    const counts: Record<string, number> = {};
                    entries.forEach((entry: any) => {
                        const rawName = getRaw(entry);
                        const name = resolveProfessionLabel(rawName);
                        if (!name) return;
                        counts[name] = (counts[name] || 0) + 1;
                    });
                    return counts;
                };
                const squadClassCountsFight = countProfessions(squadPlayers, (p) => p?.profession || p?.name);
                const allyClassCountsFight = countProfessions(allies, (p) => p?.profession || p?.name);
                const enemyClassCounts = countProfessions(enemyTargets, (t) => t?.profession || t?.name || t?.id);
                if (details.teamCounts && typeof details.teamCounts === 'object') {
                    const src: any = details.teamCounts;
                    teamCounts.red = toFiniteNumber(src.red ?? src.r ?? src[0] ?? src[1]);
                    teamCounts.green = toFiniteNumber(src.green ?? src.g ?? src[1] ?? src[2]);
                    teamCounts.blue = toFiniteNumber(src.blue ?? src.b ?? src[2] ?? src[3]);
                } else {
                    const teamValues: any[] = [];
                    targets.forEach((t: any) => {
                        if (t?.isFake) return;
                        const value = getTeamValue(t);
                        if (value !== undefined && value !== null) teamValues.push(value);
                    });
                    players.forEach((p: any) => {
                        if (!p?.notInSquad) return;
                        const value = getTeamValue(p);
                        if (value !== undefined && value !== null) teamValues.push(value);
                    });
                    // Fallback: some logs only expose team info on squad players.
                    if (teamValues.length === 0) {
                        players.forEach((p: any) => {
                            const value = getTeamValue(p);
                            if (value !== undefined && value !== null) teamValues.push(value);
                        });
                    }
                    const teamIdValues = new Set<number>();
                    teamValues.forEach((value) => {
                        if (typeof value === 'number') teamIdValues.add(value);
                    });
                    const mode: 'zeroBased' | 'oneBased' = teamIdValues.has(0)
                        ? 'zeroBased'
                        : (teamIdValues.has(3) ? 'oneBased' : 'zeroBased');
                    teamValues.forEach((value) => {
                        const key = normalizeTeam(value, mode);
                        if (!key) return;
                        teamCounts[key] += 1;
                    });
                    const totalNamedTeams = teamCounts.red + teamCounts.green + teamCounts.blue;
                    if (totalNamedTeams === 0 && teamValues.length > 0) {
                        const valueCounts = new Map<string, number>();
                        teamValues.forEach((value) => {
                            const key = String(value);
                            valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
                        });
                        const ordered = Array.from(valueCounts.values()).sort((a, b) => b - a);
                        teamCounts.red = ordered[0] || 0;
                        teamCounts.green = ordered[1] || 0;
                        teamCounts.blue = ordered[2] || 0;
                    }
                    if (teamCounts.red + teamCounts.green + teamCounts.blue === 0) {
                        // Last resort: keep table non-empty when enemy-side team metadata is missing.
                        teamCounts.red = Math.max(
                            enemyTargets.length,
                            players.filter((p: any) => p?.notInSquad).length
                        );
                    }
                }

                return {
                    id: log.filePath || `fight-${idx}`,
                    label: log.encounterName || `Fight ${idx + 1}`,
                    permalink: resolvePermalink(details, log),
                    timestamp,
                    mapName,
                    duration: formatDurationMs(details.durationMS),
                    isWin,
                    squadCount: squadPlayers.length,
                    allyCount: allies.length,
                    enemyCount: enemyTargets.length,
                    teamCounts,
                    alliesDown: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.downCount || 0), 0),
                    alliesDead: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.deadCount || 0), 0),
                    // Number of distinct allied players who were revived at least once (not total revive events).
                    alliesRevived: squadPlayers.reduce((sum: number, p: any) => (
                        Number(p.statsAll?.[0]?.saved || 0) > 0 ? sum + 1 : sum
                    ), 0),
                    rallies: 0,
                    enemyDeaths,
                    enemyDowns: Math.max(0, enemyDownsDeaths - enemyDeaths),
                    totalOutgoingDamage: totalOutgoing,
                    totalIncomingDamage: totalIncoming,
                    incomingBarrierAbsorbed: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.damageBarrier || 0), 0),
                    outgoingBarrierAbsorbed: squadPlayers.reduce((sum: number, p: any) => {
                        const outgoingBarrier = p.extBarrierStats?.outgoingBarrier;
                        if (!Array.isArray(outgoingBarrier)) return sum;
                        let playerTotal = 0;
                        outgoingBarrier.forEach((phase: any) => {
                            if (Array.isArray(phase)) {
                                phase.forEach((entry: any) => {
                                    playerTotal += Number(entry?.barrier || 0);
                                });
                                return;
                            }
                            playerTotal += Number(phase?.barrier || 0);
                        });
                        return sum + playerTotal;
                    }, 0),
                    squadClassCountsFight,
                    allyClassCountsFight,
                    enemyClassCounts
                };
            })
            .filter(Boolean);

        const getHighestSingleHit = (player: any, details: any) => {
            const skillMap = details?.skillMap || {};
            const buffMap = details?.buffMap || {};
            let bestValue = 0;
            let bestName = '';
            const resolveSkillName = (rawId: any) => {
                const idNum = Number(rawId);
                if (!Number.isFinite(idNum)) return String(rawId || 'Unknown Skill');
                const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
                if (mapped?.name) return String(mapped.name);
                const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
                if (buffMapped?.name) return String(buffMapped.name);
                return `Skill ${idNum}`;
            };
            const readEntryPeak = (entry: any) => {
                if (!entry || typeof entry !== 'object') return;
                const candidates = [
                    Number(entry.max),
                    Number(entry.maxDamage),
                    Number(entry.maxHit)
                ].filter((n) => Number.isFinite(n));
                const peak = candidates.length > 0 ? Math.max(...candidates) : 0;
                if (peak > bestValue) {
                    bestValue = peak;
                    bestName = resolveSkillName(entry.id);
                }
            };
            let sawTargetEntry = false;
            if (Array.isArray(player?.targetDamageDist)) {
                player.targetDamageDist.forEach((targetGroup: any) => {
                    if (!Array.isArray(targetGroup)) return;
                    targetGroup.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => {
                            sawTargetEntry = true;
                            readEntryPeak(entry);
                        });
                    });
                });
            }
            if ((!sawTargetEntry || bestValue <= 0) && Array.isArray(player?.totalDamageDist)) {
                player.totalDamageDist.forEach((list: any) => {
                    if (!Array.isArray(list)) return;
                    list.forEach((entry: any) => readEntryPeak(entry));
                });
            }
            return { peak: bestValue, skillName: bestName || 'Unknown Skill' };
        };

        const spikeDamage = (() => {
            const sanitizeWvwLabel = (value: any) => String(value || '')
                .replace(/^Detailed\s*WvW\s*-\s*/i, '')
                .replace(/^World\s*vs\s*World\s*-\s*/i, '')
                .replace(/^WvW\s*-\s*/i, '')
                .trim();
            const tokenizeLabel = (value: string) => sanitizeWvwLabel(value)
                .toLowerCase()
                .split(/[^a-z0-9]+/i)
                .map((token) => token.trim())
                .filter(Boolean)
                .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));
            const buildFightLabel = (fightNameRaw: string, mapNameRaw: string) => {
                const fightName = sanitizeWvwLabel(fightNameRaw);
                const mapName = sanitizeWvwLabel(mapNameRaw);
                if (!mapName) return fightName;
                if (!fightName) return mapName;
                const fightTokens = tokenizeLabel(fightName);
                const mapTokens = tokenizeLabel(mapName);
                const fightSet = new Set(fightTokens);
                const mapSet = new Set(mapTokens);
                const mapCovered = mapTokens.length > 0 && mapTokens.every((token) => fightSet.has(token));
                const fightCovered = fightTokens.length > 0 && fightTokens.every((token) => mapSet.has(token));
                if (mapCovered || fightCovered) return fightName;
                return `${fightName} - ${mapName}`;
            };
            const fights: Array<{
                id: string;
                shortLabel: string;
                fullLabel: string;
                timestamp: number;
                values: Record<string, {
                    hit: number;
                    burst1s: number;
                    burst5s: number;
                    burst30s: number;
                    skillName: string;
                    buckets5s: number[];
                    downIndices5s: number[];
                    deathIndices5s: number[];
                    skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
                }>;
                maxHit: number;
                max1s: number;
                max5s: number;
                max30s: number;
            }> = [];
            const playerMap = new Map<string, {
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
                peakFightLabel: string;
                peakSkillName: string;
            }>();

            const getPerSecondDamageSeries = (player: any) => {
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
                const sumCumulativeTargets = (targetSeries: any[]) => {
                    if (!Array.isArray(targetSeries)) return [] as number[];
                    const maxLen = targetSeries.reduce((len, series) => Math.max(len, Array.isArray(series) ? series.length : 0), 0);
                    if (maxLen <= 0) return [] as number[];
                    const summed = new Array<number>(maxLen).fill(0);
                    targetSeries.forEach((series) => {
                        if (!Array.isArray(series)) return;
                        for (let i = 0; i < maxLen; i += 1) {
                            summed[i] += Number(series[i] || 0);
                        }
                    });
                    return summed;
                };
                const normalizeNumberSeries = (series: any) =>
                    Array.isArray(series) ? series.map((value: any) => Number(value || 0)) : null;
                const extractTargetPhase0 = (targetDamage1S: any) => {
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
                            .map((target: any) => normalizeNumberSeries(Array.isArray(target) ? target[0] : null))
                            .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
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
            const resolveSkillMeta = (rawId: any, details: any) => {
                const idNum = Number(rawId);
                if (!Number.isFinite(idNum)) return { name: String(rawId || 'Unknown Skill'), icon: undefined as string | undefined };
                const skillMap = details?.skillMap || {};
                const buffMap = details?.buffMap || {};
                const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
                if (mapped?.name) return { name: String(mapped.name), icon: mapped?.icon };
                const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
                if (buffMapped?.name) return { name: String(buffMapped.name), icon: buffMapped?.icon };
                return { name: `Skill ${idNum}`, icon: undefined as string | undefined };
            };
            const toPairs = (value: any): Array<[number, number]> => {
                if (!Array.isArray(value)) return [];
                return value
                    .map((entry: any) => {
                        if (Array.isArray(entry)) return [Number(entry[0]), Number(entry[1])] as [number, number];
                        if (entry && typeof entry === 'object') return [Number(entry.time), Number(entry.value)] as [number, number];
                        return null;
                    })
                    .filter((entry: any): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && entry[0] >= 0);
            };
            const normalizeEventTimes = (times: number[], replayStarts: number[], allReplayStarts: number[], bucketCount: number, durationMs: number) => {
                if (!times.length || bucketCount <= 0) return [] as number[];
                const maxMs = Math.max(bucketCount * 5000, durationMs || 0);
                const validRangeScore = (values: number[]) => values.reduce((count, value) => (
                    value >= 0 && value <= (maxMs + 2000) ? count + 1 : count
                ), 0);
                const raw = times.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value) && value >= 0);
                if (!raw.length) return [] as number[];
                const variants: number[][] = [raw];
                const maxRaw = raw.reduce((max, value) => Math.max(max, value), 0);
                const minRaw = raw.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
                if (maxRaw > (maxMs * 20)) variants.push(raw.map((value) => value / 1000));
                if (maxRaw <= (maxMs * 2) && minRaw >= 0 && maxRaw > 0 && maxRaw < Math.max(120, bucketCount * 5 + 10)) {
                    variants.push(raw.map((value) => value * 1000));
                }
                let best = raw;
                let bestOffset = 0;
                let bestScore = -1;
                variants.forEach((variant) => {
                    const minTime = variant.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
                    const offsets = new Set<number>([0, ...replayStarts, ...allReplayStarts]);
                    if (Number.isFinite(minTime) && maxMs > 0 && minTime > maxMs) {
                        const approx = Math.floor(minTime / maxMs) * maxMs;
                        offsets.add(approx);
                        offsets.add(Math.max(0, approx - maxMs));
                    }
                    offsets.forEach((offset) => {
                        const shifted = variant.map((value) => value - offset);
                        const score = validRangeScore(shifted);
                        if (score > bestScore) {
                            bestScore = score;
                            bestOffset = offset;
                            best = variant;
                        }
                    });
                });
                return best.map((value) => value - bestOffset).filter((value) => Number.isFinite(value) && value >= 0);
            };
            const markerIndicesFromTimes = (times: number[], replayStarts: number[], allReplayStarts: number[], bucketCount: number, durationMs: number) => {
                const normalized = normalizeEventTimes(times, replayStarts, allReplayStarts, bucketCount, durationMs);
                return Array.from(new Set(normalized
                    .map((value) => Math.floor(value / 5000))
                    .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < bucketCount)));
            };

            validLogs
                .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
                .sort((a, b) => a.ts - b.ts)
                .forEach(({ log }, index) => {
                    const details = log?.details;
                    if (!details) return;
                    const fightName = sanitizeWvwLabel(details.fightName || log.fightName || `Fight ${index + 1}`);
                    const mapName = resolveMapName(details, log);
                    const fullLabel = buildFightLabel(fightName, String(mapName || ''));
                    const values: Record<string, {
                        hit: number;
                        burst1s: number;
                        burst5s: number;
                        burst30s: number;
                        skillName: string;
                        buckets5s: number[];
                        downIndices5s: number[];
                        deathIndices5s: number[];
                        skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
                    }> = {};
                    const players = Array.isArray(details.players) ? details.players : [];
                    const allReplayStarts = players
                        .flatMap((entry: any) => {
                            const replay = entry?.combatReplayData;
                            if (Array.isArray(replay)) return replay.map((seg: any) => Number(seg?.start));
                            return [Number(replay?.start)];
                        })
                        .filter((value: number) => Number.isFinite(value) && value >= 0);
                    players.forEach((player: any) => {
                        if (player?.notInSquad) return;
                        const account = String(player?.account || player?.name || 'Unknown');
                        const characterName = String(player?.character_name || player?.display_name || player?.name || '');
                        const profession = String(player?.profession || 'Unknown');
                        const key = `${account}|${profession}`;
                        const spike = getHighestSingleHit(player, details);
                        const hit = Number(spike.peak || 0);
                        const perSecond = getPerSecondDamageSeries(player);
                        const burst1s = Number(getMaxRollingDamage(perSecond, 1) || 0);
                        const burst5s = Number(getMaxRollingDamage(perSecond, 5) || 0);
                        const burst30s = Number(getMaxRollingDamage(perSecond, 30) || 0);
                        const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / 5000));
                        const damageBuckets = Math.max(0, Math.ceil(perSecond.length / 5));
                        const bucketCount = Math.max(durationBuckets, damageBuckets);
                        const rawBuckets = getBuckets(perSecond, 5);
                        const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));
                        const skillRowsMap = new Map<string, { skillName: string; damage: number; hits: number; icon?: string }>();
                        const consumeDamageEntry = (entry: any) => {
                            if (!entry || typeof entry !== 'object') return;
                            if (entry.indirectDamage) return;
                            const damage = Number(entry.totalDamage || 0);
                            if (!Number.isFinite(damage) || damage <= 0) return;
                            const hits = Number(entry.connectedHits || entry.hits || 0);
                            const skillMeta = resolveSkillMeta(entry.id, details);
                            const skillName = skillMeta.name;
                            const row = skillRowsMap.get(skillName) || { skillName, damage: 0, hits: 0, icon: skillMeta.icon };
                            row.damage += damage;
                            row.hits += Number.isFinite(hits) ? hits : 0;
                            if (!row.icon && skillMeta.icon) row.icon = skillMeta.icon;
                            skillRowsMap.set(skillName, row);
                        };
                        const targetSkillTotals = new Map<number, { damage: number; hits: number }>();
                        if (Array.isArray(player?.targetDamageDist)) {
                            player.targetDamageDist.forEach((targetGroup: any) => {
                                if (!Array.isArray(targetGroup)) return;
                                targetGroup.forEach((list: any) => {
                                    if (!Array.isArray(list)) return;
                                    list.forEach((entry: any) => {
                                        const skillId = Number(entry?.id);
                                        const damage = Number(entry?.totalDamage || 0);
                                        if (Number.isFinite(skillId)) {
                                            const existing = targetSkillTotals.get(skillId) || { damage: 0, hits: 0 };
                                            existing.damage += Number.isFinite(damage) ? damage : 0;
                                            existing.hits += Number(entry?.connectedHits || entry?.hits || 0);
                                            targetSkillTotals.set(skillId, existing);
                                        }
                                        consumeDamageEntry(entry);
                                    });
                                });
                            });
                        }
                        const allowTotalSupplement = !details?.detailedWvW;
                        if (allowTotalSupplement && Array.isArray(player?.totalDamageDist)) {
                            player.totalDamageDist.forEach((list: any) => {
                                if (!Array.isArray(list)) return;
                                list.forEach((entry: any) => {
                                    const skillId = Number(entry?.id);
                                    if (!Number.isFinite(skillId)) {
                                        consumeDamageEntry(entry);
                                        return;
                                    }
                                    const target = targetSkillTotals.get(skillId);
                                    if (!target) {
                                        consumeDamageEntry(entry);
                                        return;
                                    }
                                    const totalDamage = Number(entry?.totalDamage || 0);
                                    const totalHits = Number(entry?.connectedHits || entry?.hits || 0);
                                    const deltaDamage = totalDamage - Number(target.damage || 0);
                                    const deltaHits = totalHits - Number(target.hits || 0);
                                    if (deltaDamage <= 0 && deltaHits <= 0) return;
                                    consumeDamageEntry({
                                        ...entry,
                                        totalDamage: Math.max(0, deltaDamage),
                                        connectedHits: Math.max(0, deltaHits),
                                        hits: Math.max(0, deltaHits)
                                    });
                                });
                            });
                        }
                        const replayEntries = (() => {
                            const replay = player?.combatReplayData;
                            if (Array.isArray(replay)) return replay.filter((entry: any) => entry && typeof entry === 'object');
                            return replay && typeof replay === 'object' ? [replay] : [];
                        })();
                        const replayStarts = replayEntries
                            .map((entry: any) => Number(entry?.start))
                            .filter((value: number) => Number.isFinite(value) && value >= 0);
                        const downTimes = replayEntries.flatMap((entry: any) => toPairs(entry?.down).map(([time]) => Number(time || 0)));
                        const deathTimes = replayEntries.flatMap((entry: any) => toPairs(entry?.dead).map(([time]) => Number(time || 0)));
                        values[key] = {
                            hit,
                            burst1s,
                            burst5s,
                            burst30s,
                            skillName: spike.skillName || 'Unknown Skill',
                            buckets5s,
                            downIndices5s: markerIndicesFromTimes(downTimes, replayStarts, allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                            deathIndices5s: markerIndicesFromTimes(deathTimes, replayStarts, allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                            skillRows: Array.from(skillRowsMap.values())
                                .sort((a, b) => b.damage - a.damage)
                                .slice(0, 50)
                        };

                        const existing = playerMap.get(key) || {
                            key,
                            account,
                            displayName: account,
                            characterName,
                            profession,
                            professionList: [profession],
                            logs: 0,
                            peakHit: 0,
                            peak1s: 0,
                            peak5s: 0,
                            peak30s: 0,
                            peakFightLabel: '',
                            peakSkillName: ''
                        };
                        existing.logs += 1;
                        if (!existing.professionList.includes(profession)) {
                            existing.professionList.push(profession);
                        }
                        if (!existing.characterName && characterName) {
                            existing.characterName = characterName;
                        }
                        if (hit > existing.peakHit) {
                            existing.peakHit = hit;
                            existing.peakFightLabel = fullLabel;
                            existing.peakSkillName = spike.skillName || 'Unknown Skill';
                        }
                        if (burst1s > existing.peak1s) existing.peak1s = burst1s;
                        if (burst5s > existing.peak5s) existing.peak5s = burst5s;
                        if (burst30s > existing.peak30s) existing.peak30s = burst30s;
                        playerMap.set(key, existing);
                    });

                    const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
                    const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
                    const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
                    const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
                    fights.push({
                        id: log.filePath || log.id || `fight-${index + 1}`,
                        shortLabel: `F${index + 1}`,
                        fullLabel,
                        timestamp: resolveFightTimestamp(details, log),
                        values,
                        maxHit,
                        max1s,
                        max5s,
                        max30s
                    });
                });

            const players = Array.from(playerMap.values()).sort((a, b) => {
                if (b.peakHit !== a.peakHit) return b.peakHit - a.peakHit;
                return a.displayName.localeCompare(b.displayName);
            });

            return { fights, players };
        })();

        const incomingStrikeDamage = (() => {
            const sanitizeWvwLabel = (value: any) => String(value || '')
                .replace(/^Detailed\s*WvW\s*-\s*/i, '')
                .replace(/^World\s*vs\s*World\s*-\s*/i, '')
                .replace(/^WvW\s*-\s*/i, '')
                .trim();
            const tokenizeLabel = (value: string) => sanitizeWvwLabel(value)
                .toLowerCase()
                .split(/[^a-z0-9]+/i)
                .map((token) => token.trim())
                .filter(Boolean)
                .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));
            const buildFightLabel = (fightNameRaw: string, mapNameRaw: string) => {
                const fightName = sanitizeWvwLabel(fightNameRaw);
                const mapName = sanitizeWvwLabel(mapNameRaw);
                if (!mapName) return fightName;
                if (!fightName) return mapName;
                const fightTokens = tokenizeLabel(fightName);
                const mapTokens = tokenizeLabel(mapName);
                const fightSet = new Set(fightTokens);
                const mapSet = new Set(mapTokens);
                const mapCovered = mapTokens.length > 0 && mapTokens.every((token) => fightSet.has(token));
                const fightCovered = fightTokens.length > 0 && fightTokens.every((token) => mapSet.has(token));
                if (mapCovered || fightCovered) return fightName;
                return `${fightName} - ${mapName}`;
            };
            const fights: Array<{
                id: string;
                shortLabel: string;
                fullLabel: string;
                timestamp: number;
                values: Record<string, {
                    hit: number;
                    burst1s: number;
                    burst5s: number;
                    burst30s: number;
                    skillName: string;
                    buckets5s: number[];
                    downIndices5s: number[];
                    deathIndices5s: number[];
                }>;
                maxHit: number;
                max1s: number;
                max5s: number;
                max30s: number;
            }> = [];
            const playerMap = new Map<string, {
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
                peakFightLabel: string;
                peakSkillName: string;
            }>();

            const resolveSkillMeta = (rawId: any, details: any) => {
                const idNum = Number(rawId);
                if (!Number.isFinite(idNum)) return { name: String(rawId || 'Unknown Skill'), icon: undefined as string | undefined };
                const skillMap = details?.skillMap || {};
                const buffMap = details?.buffMap || {};
                const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
                if (mapped?.name) return { name: String(mapped.name), icon: mapped?.icon };
                const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
                if (buffMapped?.name) return { name: String(buffMapped.name), icon: buffMapped?.icon };
                return { name: `Skill ${idNum}`, icon: undefined as string | undefined };
            };
            const getHighestIncomingStrikeHit = (target: any, details: any) => {
                let bestValue = 0;
                let bestName = '';
                const readEntryPeak = (entry: any) => {
                    if (!entry || typeof entry !== 'object') return;
                    if (entry.indirectDamage) return;
                    const candidates = [
                        Number(entry.max),
                        Number(entry.maxDamage),
                        Number(entry.maxHit)
                    ].filter((n) => Number.isFinite(n));
                    const peak = candidates.length > 0 ? Math.max(...candidates) : 0;
                    if (peak > bestValue) {
                        bestValue = peak;
                        bestName = resolveSkillMeta(entry.id, details).name;
                    }
                };
                if (Array.isArray(target?.totalDamageDist)) {
                    target.totalDamageDist.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => readEntryPeak(entry));
                    });
                }
                if (Array.isArray(target?.targetDamageDist)) {
                    target.targetDamageDist.forEach((targetGroup: any) => {
                        if (!Array.isArray(targetGroup)) return;
                        targetGroup.forEach((list: any) => {
                            if (!Array.isArray(list)) return;
                            list.forEach((entry: any) => readEntryPeak(entry));
                        });
                    });
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
            const normalizeCumulativeSeries = (value: any): number[] => {
                if (!Array.isArray(value) || value.length === 0) return [];
                const first = value[0];
                if (typeof first === 'number') {
                    return value.map((entry: any) => Number(entry || 0));
                }
                if (Array.isArray(first) && first.length > 0) {
                    if (typeof first[0] === 'number') {
                        return first.map((entry: any) => Number(entry || 0));
                    }
                    if (Array.isArray(first[0])) {
                        // Handles nested shapes like [phase][target][time] by summing phase 0 targets.
                        const phase0Targets = first
                            .map((series: any) => Array.isArray(series) ? series.map((entry: any) => Number(entry || 0)) : null)
                            .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
                        if (phase0Targets.length > 0) {
                            return sumSeries(phase0Targets);
                        }
                    }
                }
                return [];
            };
            const getPerSecondStrikeSeries = (target: any) => {
                const cumulativePower = normalizeCumulativeSeries(target?.powerDamage1S);
                const cumulativeAny = normalizeCumulativeSeries(target?.damage1S);
                const cumulative = cumulativePower.length > 0 ? cumulativePower : cumulativeAny;
                return toPerSecond(cumulative);
            };
            const getTargetPowerCumulativeFromPlayer = (player: any, targetIndex: number) => {
                const targetPower = player?.targetPowerDamage1S;
                if (!Array.isArray(targetPower) || !Array.isArray(targetPower[targetIndex])) return [] as number[];
                const targetEntry = targetPower[targetIndex];
                if (!Array.isArray(targetEntry) || targetEntry.length === 0) return [] as number[];
                if (typeof targetEntry[0] === 'number') {
                    return targetEntry.map((value: any) => Number(value || 0));
                }
                if (Array.isArray(targetEntry[0]) && !Array.isArray(targetEntry[0][0])) {
                    return targetEntry[0].map((value: any) => Number(value || 0));
                }
                if (Array.isArray(targetEntry[0]) && Array.isArray(targetEntry[0][0])) {
                    const phase0 = targetEntry[0];
                    const flattened = phase0
                        .map((series: any) => Array.isArray(series) ? series.map((value: any) => Number(value || 0)) : null)
                        .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
                    return sumSeries(flattened);
                }
                return [] as number[];
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
            const toPairs = (value: any): Array<[number, number]> => {
                if (!Array.isArray(value)) return [];
                return value
                    .map((entry: any) => {
                        if (Array.isArray(entry)) return [Number(entry[0]), Number(entry[1])] as [number, number];
                        if (entry && typeof entry === 'object') return [Number(entry.time), Number(entry.value)] as [number, number];
                        return null;
                    })
                    .filter((entry: any): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && entry[0] >= 0);
            };
            const normalizeEventTimes = (times: number[], replayStarts: number[], allReplayStarts: number[], bucketCount: number, durationMs: number) => {
                if (!times.length || bucketCount <= 0) return [] as number[];
                const maxMs = Math.max(bucketCount * 5000, durationMs || 0);
                const validRangeScore = (values: number[]) => values.reduce((count, value) => (
                    value >= 0 && value <= (maxMs + 2000) ? count + 1 : count
                ), 0);
                const raw = times.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value) && value >= 0);
                if (!raw.length) return [] as number[];
                const variants: number[][] = [raw];
                const maxRaw = raw.reduce((max, value) => Math.max(max, value), 0);
                const minRaw = raw.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
                if (maxRaw > (maxMs * 20)) variants.push(raw.map((value) => value / 1000));
                if (maxRaw <= (maxMs * 2) && minRaw >= 0 && maxRaw > 0 && maxRaw < Math.max(120, bucketCount * 5 + 10)) {
                    variants.push(raw.map((value) => value * 1000));
                }
                let best = raw;
                let bestOffset = 0;
                let bestScore = -1;
                variants.forEach((variant) => {
                    const minTime = variant.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
                    const offsets = new Set<number>([0, ...replayStarts, ...allReplayStarts]);
                    if (Number.isFinite(minTime) && maxMs > 0 && minTime > maxMs) {
                        const approx = Math.floor(minTime / maxMs) * maxMs;
                        offsets.add(approx);
                        offsets.add(Math.max(0, approx - maxMs));
                    }
                    offsets.forEach((offset) => {
                        const shifted = variant.map((value) => value - offset);
                        const score = validRangeScore(shifted);
                        if (score > bestScore) {
                            bestScore = score;
                            bestOffset = offset;
                            best = variant;
                        }
                    });
                });
                return best.map((value) => value - bestOffset).filter((value) => Number.isFinite(value) && value >= 0);
            };
            const markerIndicesFromTimes = (times: number[], replayStarts: number[], allReplayStarts: number[], bucketCount: number, durationMs: number) => {
                const normalized = normalizeEventTimes(times, replayStarts, allReplayStarts, bucketCount, durationMs);
                return Array.from(new Set(normalized
                    .map((value) => Math.floor(value / 5000))
                    .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < bucketCount)));
            };

            validLogs
                .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
                .sort((a, b) => a.ts - b.ts)
                .forEach(({ log }, index) => {
                    const details = log?.details;
                    if (!details) return;
                    const fightName = sanitizeWvwLabel(details.fightName || log.fightName || `Fight ${index + 1}`);
                    const mapName = resolveMapName(details, log);
                    const fullLabel = buildFightLabel(fightName, String(mapName || ''));
                    const values: Record<string, {
                        hit: number;
                        burst1s: number;
                        burst5s: number;
                        burst30s: number;
                        skillName: string;
                        buckets5s: number[];
                        downIndices5s: number[];
                        deathIndices5s: number[];
                        skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
                    }> = {};
                    const allPlayers = Array.isArray(details.players) ? details.players : [];
                    const squadPlayers = allPlayers.filter((entry: any) => !entry?.notInSquad);
                    const allReplayStarts = squadPlayers
                        .flatMap((entry: any) => {
                            const replay = entry?.combatReplayData;
                            if (Array.isArray(replay)) return replay.map((seg: any) => Number(seg?.start));
                            return [Number(replay?.start)];
                        })
                        .filter((value: number) => Number.isFinite(value) && value >= 0);
                    const downTimes = squadPlayers.flatMap((entry: any) => {
                        const replay = entry?.combatReplayData;
                        const segments = Array.isArray(replay) ? replay : (replay ? [replay] : []);
                        return segments.flatMap((segment: any) => toPairs(segment?.down).map(([time]) => Number(time || 0)));
                    });
                    const deathTimes = squadPlayers.flatMap((entry: any) => {
                        const replay = entry?.combatReplayData;
                        const segments = Array.isArray(replay) ? replay : (replay ? [replay] : []);
                        return segments.flatMap((segment: any) => toPairs(segment?.dead).map(([time]) => Number(time || 0)));
                    });

                    const classSeries = new Map<string, { perSecond: number[]; hit: number; skillName: string }>();
                    const classSkillRows = new Map<string, Map<string, { skillName: string; damage: number; hits: number; icon?: string }>>();
                    const classCounts = new Map<string, number>();
                    const targets = Array.isArray(details.targets) ? details.targets : [];
                    targets.forEach((target: any, targetIndex: number) => {
                        if (!target || target.isFake || !target.enemyPlayer) return;
                        const profession = resolveProfessionLabel(target?.profession || target?.name || target?.id) || 'Unknown';
                        classCounts.set(profession, (classCounts.get(profession) || 0) + 1);
                        const skillBucket = classSkillRows.get(profession) || new Map<string, { skillName: string; damage: number; hits: number; icon?: string }>();
                        if (Array.isArray(target?.totalDamageDist)) {
                            target.totalDamageDist.forEach((list: any) => {
                                if (!Array.isArray(list)) return;
                                list.forEach((entry: any) => {
                                    if (!entry || typeof entry !== 'object') return;
                                    if (entry.indirectDamage) return;
                                    const damage = Number(entry.totalDamage || 0);
                                    if (!Number.isFinite(damage) || damage <= 0) return;
                                    const hits = Number(entry.connectedHits || entry.hits || 0);
                                    const skillMeta = resolveSkillMeta(entry.id, details);
                                    const skillName = skillMeta.name;
                                    const row = skillBucket.get(skillName) || { skillName, damage: 0, hits: 0, icon: skillMeta.icon };
                                    row.damage += damage;
                                    row.hits += Number.isFinite(hits) ? hits : 0;
                                    if (!row.icon && skillMeta.icon) row.icon = skillMeta.icon;
                                    skillBucket.set(skillName, row);
                                });
                            });
                        }
                        classSkillRows.set(profession, skillBucket);
                        const squadTargetCumulative = sumSeries(squadPlayers.map((player: any) =>
                            getTargetPowerCumulativeFromPlayer(player, targetIndex)
                        ));
                        const strikeSeries = squadTargetCumulative.length > 0
                            ? toPerSecond(squadTargetCumulative)
                            : getPerSecondStrikeSeries(target);
                        const bestHit = getHighestIncomingStrikeHit(target, details);
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
                        const squadIncomingSeries = sumSeries(squadPlayers.map((player: any) => {
                            const cumulative = normalizeCumulativeSeries(player?.powerDamageTaken1S);
                            return toPerSecond(cumulative);
                        }));
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
                        values[key] = {
                            hit,
                            burst1s,
                            burst5s,
                            burst30s,
                            skillName: entry.skillName || 'Unknown Skill',
                            buckets5s,
                            downIndices5s: markerIndicesFromTimes(downTimes, [], allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                            deathIndices5s: markerIndicesFromTimes(deathTimes, [], allReplayStarts, bucketCount, Number(details?.durationMS || 0)),
                            skillRows: Array.from(classSkillRows.get(profession)?.values() || [])
                                .sort((a, b) => b.damage - a.damage)
                                .slice(0, 50)
                        };

                        const existing = playerMap.get(key) || {
                            key,
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
                            peakFightLabel: '',
                            peakSkillName: ''
                        };
                        existing.logs += 1;
                        if (hit > existing.peakHit) {
                            existing.peakHit = hit;
                            existing.peakFightLabel = fullLabel;
                            existing.peakSkillName = entry.skillName || 'Unknown Skill';
                        }
                        if (burst1s > existing.peak1s) existing.peak1s = burst1s;
                        if (burst5s > existing.peak5s) existing.peak5s = burst5s;
                        if (burst30s > existing.peak30s) existing.peak30s = burst30s;
                        playerMap.set(key, existing);
                    });

                    const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
                    const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
                    const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
                    const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
                    fights.push({
                        id: log.filePath || log.id || `fight-${index + 1}`,
                        shortLabel: `F${index + 1}`,
                        fullLabel,
                        timestamp: resolveFightTimestamp(details, log),
                        values,
                        maxHit,
                        max1s,
                        max5s,
                        max30s
                    });
                });

            const players = Array.from(playerMap.values()).sort((a, b) => {
                if (b.peakHit !== a.peakHit) return b.peakHit - a.peakHit;
                return a.displayName.localeCompare(b.displayName);
            });

            return { fights, players };
        })();

        const specialTables = Array.from(specialBuffAgg.entries()).map(([buffId, players]) => {
            const meta = specialBuffMeta.get(buffId) || {};
            const rows = Array.from(players.values()).map((entry) => {
                const professionList = Array.from(entry.professions || []).filter((prof) => prof && prof !== 'Unknown');
                let primaryProfession = entry.profession || 'Unknown';
                if (professionList.length > 0) {
                    primaryProfession = professionList[0];
                    let maxTime = entry.professionTimeMs?.[primaryProfession] || 0;
                    professionList.forEach((prof) => {
                        const time = entry.professionTimeMs?.[prof] || 0;
                        if (time > maxTime) {
                            maxTime = time;
                            primaryProfession = prof;
                        }
                    });
                }
                const durationMs = entry.durationMs || 0;
                const total = entry.totalMs / 1000;
                const perSecond = durationMs > 0 ? (entry.totalMs / durationMs) : 0;
                const fullPlayerDurationMs = playerStats.get(entry.account)?.supportActiveMs || durationMs;
                const uptimePerSecond = fullPlayerDurationMs > 0 ? (entry.uptimeMs / fullPlayerDurationMs) : 0;
                return {
                    account: entry.account,
                    profession: primaryProfession,
                    professionList,
                    total,
                    perSecond,
                    uptimePerSecond,
                    duration: durationMs / 1000
                };
            }).filter((row) => row.total > 0 || row.perSecond > 0);
            return {
                id: buffId,
                name: meta.name || buffId,
                icon: meta.icon,
                rows
            };
        }).filter((table) => table.rows.length > 0);

        const playerSkillBreakdowns = Array.from(playerSkillBreakdownMap.values())
            .map((entry) => {
                const skills = Array.from(entry.skills.values())
                    .sort((a, b) => b.damage - a.damage);
                const skillMap = skills.reduce<Record<string, PlayerSkillDamageEntry>>((acc, skill) => {
                    acc[skill.id] = skill;
                    return acc;
                }, {});
                return {
                    key: entry.key,
                    account: entry.account,
                    displayName: entry.displayName,
                    profession: entry.profession,
                    professionList: entry.professionList,
                    totalFightMs: entry.totalFightMs,
                    skills,
                    skillMap
                };
            })
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

        return {
            total, wins, losses, avgSquadSize, avgEnemies, squadKDR, enemyKDR,
            totalSquadKills, totalSquadDeaths, totalEnemyKills, totalEnemyDeaths,
            leaderboards,
            ...topStats,
            outgoingConditionSummary: Object.values(outgoingCondiTotals).sort((a, b) => b.damage - a.damage),
            incomingConditionSummary: Object.values(incomingCondiTotals).sort((a, b) => b.damage - a.damage),
            outgoingConditionPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                conditions: s.outgoingConditions
            })),
            incomingConditionPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                conditions: s.incomingConditions
            })),
            topSkills, topIncomingSkills,
            playerSkillBreakdowns,
            topSkillsMetric,
            mapData, timelineData, boonTables,
            offensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                offenseTotals: s.offenseTotals, offenseRateWeights: s.offenseRateWeights, totalFightMs: s.totalFightMs
            })),
            defensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                defenseTotals: s.defenseTotals, activeMs: s.defenseActiveMs
            })),
            damageMitigationPlayers,
            damageMitigationMinions,
            supportPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                supportTotals: s.supportTotals, activeMs: s.supportActiveMs
            })),
            healingPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                healingTotals: s.healingTotals, activeMs: s.healingActiveMs
            })),
            mvp, silver, bronze,
            squadClassData,
            enemyClassData,
            fightBreakdown,
            spikeDamage,
            incomingStrikeDamage,
            specialTables,
            topStatsPerSecond,
            topStatsLeaderboardsPerSecond: perSecondLeaderboards,
            avgMvpScore
        };
    })();

    const skillUsageData = (() => {
        const skillTotals = new Map<string, number>();
        const playerMap = new Map<string, SkillUsagePlayer>();
        const logRecords: SkillUsageLogRecord[] = [];
        const skillNameMap = new Map<string, string>();
        const skillIconMap = new Map<string, string>();

        validLogs.forEach((log) => {
            const details = log.details;
            if (!details) return;
            const skillMap = details.skillMap || {};
            const label = details.fightName || 'Log';
            const timestamp = resolveFightTimestamp(details, log) || Date.now();

            const record: SkillUsageLogRecord = {
                id: log.filePath || log.id || label,
                label, timestamp, skillEntries: {}, playerActiveSeconds: {},
                durationSeconds: details.durationMS ? details.durationMS / 1000 : 0
            };

            const players = (details.players || []) as any[];
            players.forEach((p) => {
                if (p.notInSquad) return;
                const account = p.account || p.name || 'Unknown';
                const profession = p.profession || 'Unknown';
                const key = `${account}|${profession}`;
                let pr = playerMap.get(key);
                if (!pr) {
                    pr = { key, account, displayName: account, profession, professionList: [profession], logs: 0, totalActiveSeconds: 0, skillTotals: {} };
                    playerMap.set(key, pr);
                }
                pr.logs++;
                const activeSec = (Array.isArray(p.activeTimes) ? p.activeTimes[0] : 0) / 1000;
                pr.totalActiveSeconds = (pr.totalActiveSeconds || 0) + activeSec;
                record.playerActiveSeconds![key] = activeSec;

                (p.rotation || []).forEach((rot: any) => {
                    if (!rot?.id) return;
                    const count = rot.skills?.length || 0;
                    if (count <= 0) return;
                    const sId = `s${rot.id}`;
                    const sName = skillMap[sId]?.name || `Skill ${rot.id}`;
                    const sIcon = skillMap[sId]?.icon;
                    pr!.skillTotals[sId] = (pr!.skillTotals[sId] || 0) + count;
                    skillTotals.set(sId, (skillTotals.get(sId) || 0) + count);
                    skillNameMap.set(sId, sName);
                    if (sIcon && !skillIconMap.has(sId)) skillIconMap.set(sId, sIcon);

                    if (!record.skillEntries[sId]) record.skillEntries[sId] = { name: sName, icon: sIcon, players: {} };
                    if (!record.skillEntries[sId].icon && sIcon) record.skillEntries[sId].icon = sIcon;
                    record.skillEntries[sId].players[key] = (record.skillEntries[sId].players[key] || 0) + count;
                });
            });
            logRecords.push(record);
        });

        const skillOptions = Array.from(skillTotals.entries()).map(([id, total]) => ({
            id, name: skillNameMap.get(id) || id, total, icon: skillIconMap.get(id)
        })).sort((a, b) => b.total - a.total);

        return {
            logRecords,
            players: Array.from(playerMap.values()),
            skillOptions,
            resUtilitySkills: []
        };
    })();

    return {
        validLogs,
        stats,
        skillUsageData
    };
};
