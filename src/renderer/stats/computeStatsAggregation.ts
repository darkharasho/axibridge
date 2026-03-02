
import { applyStabilityGeneration, getPlayerCleanses, getPlayerStrips, getPlayerDownContribution, getPlayerSquadHealing, getPlayerSquadBarrier, getPlayerOutgoingCrowdControl } from "../../shared/dashboardMetrics";
import { Player } from '../../shared/dpsReportTypes';
import { DisruptionMethod, IMvpWeights, IStatsViewSettings, DEFAULT_DISRUPTION_METHOD, DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';
import { buildConditionIconMap, computeOutgoingConditions, normalizeConditionLabel, resolveBuffMetaById, resolveConditionNameFromEntry } from '../../shared/conditionsMetrics';
import { OFFENSE_METRICS, DEFENSE_METRICS, SUPPORT_METRICS, NON_DAMAGING_CONDITIONS } from './statsMetrics';
import { isResUtilitySkill, formatDurationMs } from './utils/dashboardUtils';
import { PlayerSkillDamageEntry } from './statsTypes';
import { PROFESSION_COLORS, getProfessionColor } from '../../shared/professionUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { computeSkillUsageData } from './computeSkillUsageData';
import { computeSpikeDamageData } from './computeSpikeDamageData';
import { computeIncomingStrikeDamageData } from './computeIncomingStrikeDamageData';
import { computeCommanderStats } from './computeCommanderStats';
import { resolveMapName } from './utils/labelUtils';
import { computeTimelineAndMapData } from './computeTimelineAndMapData';
import { computeFightDiffMode } from './computeFightDiffMode';
import { computeSpecialTables } from './computeSpecialTables';

interface UseStatsAggregationProps {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeights;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
    includePlayerSkillMap?: boolean;
}

const enrichPrecomputedStats = (input: any, logs: any[]) => {
        if (!input || typeof input !== 'object') return input;
        const fights = Array.isArray(input.fightBreakdown) ? input.fightBreakdown : null;
        if (!fights || fights.length === 0) return input;
        const hasTeamBreakdown = (value: any) =>
            Array.isArray(value) && value.some((entry) => entry && Number(entry.count) > 0);

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
            const keyId = fight.id ? String(fight.id) : '';
            const keyPermalink = typeof fight.permalink === 'string' ? fight.permalink.trim() : '';
            const matchedLog = (keyId ? byId.get(keyId) : undefined) || (keyPermalink ? byPermalink.get(keyPermalink) : undefined);
            if (!matchedLog) return fight;

            let nextFight = fight;
            if (Number(fight.timestamp) <= 0) {
                const resolved = resolveFightTimestamp(matchedLog?.details, matchedLog);
                if (resolved) nextFight = { ...nextFight, timestamp: resolved };
            }
            const detailsTeamBreakdown = matchedLog?.details?.teamBreakdown;
            if (hasTeamBreakdown(detailsTeamBreakdown)) {
                nextFight = { ...nextFight, teamBreakdown: detailsTeamBreakdown };
            }
            return nextFight;
        });

        const existingDiff = Array.isArray((input as any).fightDiffMode) ? (input as any).fightDiffMode : [];
        const hasUsableExistingDiff = existingDiff.some((fight: any) => (
            Array.isArray(fight?.targetFocus) && fight.targetFocus.some((row: any) => Number(row?.damage || 0) > 0 || Number(row?.hits || 0) > 0)
        ));
        const derivedFightDiffMode = hasUsableExistingDiff ? existingDiff : normalizedFights.map((fight: any, idx: number) => {
            const enemyClassCounts = (fight && typeof fight.enemyClassCounts === 'object' && fight.enemyClassCounts)
                ? fight.enemyClassCounts
                : {};
            const classRows = Object.entries(enemyClassCounts as Record<string, number>)
                .map(([label, count]) => ({ label: String(label || 'Unknown'), count: Number(count || 0) }))
                .filter((row) => row.count > 0)
                .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
            const totalCount = classRows.reduce((sum, row) => sum + row.count, 0);
            const targetFocus = classRows.map((row) => ({
                label: row.label,
                damage: row.count,
                hits: 0,
                share: totalCount > 0 ? row.count / totalCount : 0
            }));
            const enemyDowns = Number(fight?.enemyDowns || 0);
            const enemyDeaths = Number(fight?.enemyDeaths || 0);
            const squadDowns = Number(fight?.alliesDown || 0);
            const squadDeaths = Number(fight?.alliesDead || 0);
            const totalOutgoingDamage = Number(fight?.totalOutgoingDamage || 0);
            const totalIncomingDamage = Number(fight?.totalIncomingDamage || 0);
            const squadMetrics = [
                { metricId: 'winFlag', metricLabel: 'Win (1) / Loss (0)', higherIsBetter: true, value: fight?.isWin ? 1 : 0 },
                { metricId: 'squadCount', metricLabel: 'Squad Size', higherIsBetter: true, value: Number(fight?.squadCount || 0) },
                { metricId: 'enemyCount', metricLabel: 'Enemy Count', higherIsBetter: false, value: Number(fight?.enemyCount || 0) },
                { metricId: 'squadKdr', metricLabel: 'Squad KDR', higherIsBetter: true, value: squadDeaths > 0 ? (enemyDeaths / squadDeaths) : enemyDeaths },
                { metricId: 'enemyDeaths', metricLabel: 'Enemy Deaths', higherIsBetter: true, value: enemyDeaths },
                { metricId: 'enemyDowns', metricLabel: 'Enemy Downs', higherIsBetter: true, value: enemyDowns },
                { metricId: 'squadDeaths', metricLabel: 'Squad Deaths', higherIsBetter: false, value: squadDeaths },
                { metricId: 'squadDowns', metricLabel: 'Squad Downs', higherIsBetter: false, value: squadDowns },
                { metricId: 'damageDelta', metricLabel: 'Damage Delta', higherIsBetter: true, value: totalOutgoingDamage - totalIncomingDamage },
                { metricId: 'outgoingDamage', metricLabel: 'Outgoing Damage', higherIsBetter: true, value: totalOutgoingDamage },
                { metricId: 'incomingDamage', metricLabel: 'Incoming Damage', higherIsBetter: false, value: totalIncomingDamage },
                { metricId: 'barrierIncomingAbsorb', metricLabel: 'Barrier Absorption (Incoming)', higherIsBetter: true, value: Number(fight?.incomingBarrierAbsorbed || 0) },
                { metricId: 'enemyBarrierAbsorb', metricLabel: 'Enemy Barrier Absorption', higherIsBetter: false, value: Number(fight?.outgoingBarrierAbsorbed || 0) },
                { metricId: 'alliesRevived', metricLabel: 'Allies Revived (Players)', higherIsBetter: true, value: Number(fight?.alliesRevived || 0) }
            ];
            return {
                id: String(fight?.id || `fight-${idx + 1}`),
                shortLabel: `F${idx + 1}`,
                fullLabel: `${String(fight?.mapName || fight?.label || 'Unknown Map')} • ${String(fight?.duration || '--:--')}`,
                mapName: String(fight?.mapName || ''),
                timestamp: Number(fight?.timestamp || 0),
                duration: String(fight?.duration || '--:--'),
                isWin: Boolean(fight?.isWin),
                targetFocus,
                squadMetrics
            };
        });

        return { ...input, fightBreakdown: normalizedFights, fightDiffMode: derivedFightDiffMode };
};

export const computeStatsAggregation = ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod, includePlayerSkillMap }: UseStatsAggregationProps) => {

    const hasDetailedRoster = (log: any) => {
        const players = Array.isArray(log?.details?.players) ? log.details.players : [];
        return players.length > 0;
    };
    const validLogs = logs.filter((log) => hasDetailedRoster(log));
    const activeStatsViewSettings = statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS;
    const activeMvpWeights = mvpWeights || DEFAULT_MVP_WEIGHTS;

    const stats = (() => {
        if (precomputedStats) {
            return enrichPrecomputedStats(precomputedStats, logs);
        }

        const method = disruptionMethod || DEFAULT_DISRUPTION_METHOD;
        const shouldIncludePlayerSkillMap = includePlayerSkillMap !== false;
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
        let totalSquadDowns = 0;
        let totalEnemyDowns = 0;

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

        // Player Aggregation
        interface PlayerStats {
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

            const squadPlayers = players.filter(p => !p.notInSquad);
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
                const account = p.account || 'Unknown';
                const key = account !== 'Unknown' ? account : (p.name || 'Unknown');
                const name = p.name || 'Unknown';

                if (!playerStats.has(key)) {
                    playerStats.set(key, {
                        name, account: key, characterNames: new Set<string>(), downContrib: 0, cleanses: 0, strips: 0, stab: 0, healing: 0, barrier: 0, cc: 0, logsJoined: 0,
                        totalDist: 0, distCount: 0, dodges: 0, downs: 0, deaths: 0, totalFightMs: 0,
                        offenseTotals: {}, offenseRateWeights: {}, defenseActiveMs: 0, defenseTotals: {}, defenseMinionDamageTaken: {}, supportActiveMs: 0, supportTotals: {},
                        healingActiveMs: 0, healingTotals: {}, profession: p.profession || 'Unknown', professions: new Set(),
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
                        });
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

        const topSkillsByDamage = Object.values(skillDamageMap)
            .sort((a, b) => b.damage - a.damage || b.hits - a.hits || String(a.name || '').localeCompare(String(b.name || '')))
            .slice(0, 25);
        const topSkillsByDownContribution = Object.values(skillDamageMap)
            .sort((a, b) => b.downContribution - a.downContribution || b.hits - a.hits || String(a.name || '').localeCompare(String(b.name || '')))
            .slice(0, 25);
        const topSkills = topSkillsMetric === 'downContribution' ? topSkillsByDownContribution : topSkillsByDamage;
        const topIncomingSkills = Object.values(incomingSkillDamageMap).sort((a, b) => b.damage - a.damage).slice(0, 25);

        // Helpers used by fightBreakdown below
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
        const resolveFightDurationLabel = (details: any, log: any) => {
            const durationMs = Number(details?.durationMS || 0);
            if (durationMs > 0) return formatDurationMs(durationMs);
            const fallback = typeof log?.encounterDuration === 'string' ? log.encounterDuration.trim() : '';
            return fallback || '--:--';
        };
        const resolveFightOutcomeForDisplay = (details: any, log: any): boolean | null => {
            const players = Array.isArray(details?.players) ? details.players : [];
            if (players.length > 0) return getFightOutcome(details);
            if (typeof details?.success === 'boolean') return details.success;
            const summary = log?.dashboardSummary;
            if (summary && typeof summary === 'object') {
                if (summary.isWin === true) return true;
                if (summary.isWin === false) return false;
            }
            return null;
        };

        // Map data, timeline, boon tables
        const { sortedFightLogs, sortedFightLogsWithDetails, mapData, timelineData, boonTables, boonTimeline, boonUptimeTimeline } = computeTimelineAndMapData(logs, validLogs);

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
        const fightBreakdown = sortedFightLogs
            .map(({ log }, idx) => {
                const details = log?.details;
                const players = Array.isArray(details?.players) ? details.players : [];
                const squadPlayers = players.filter((p: any) => !p.notInSquad);
                const allies = players.filter((p: any) => p.notInSquad);
                const targets = Array.isArray(details?.targets) ? details.targets : [];
                const enemyTargets = targets.filter((t: any) => !t.isFake);
                const summary = log?.dashboardSummary && typeof log.dashboardSummary === 'object'
                    ? log.dashboardSummary
                    : null;
                const totalOutgoing = squadPlayers.reduce((sum: number, p: any) => sum + (p.dpsAll?.[0]?.damage || 0), 0);
                const totalIncoming = squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.damageTaken || 0), 0);
                const { enemyDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
                const isWin = resolveFightOutcomeForDisplay(details, log);
                const timestamp = resolveFightTimestamp(details, log);
                const mapName = resolveMapName(details, log);
                const getTeamValue = (entity: any) => {
                    if (!entity || typeof entity !== 'object') return undefined;
                    const direct = entity.teamID ?? entity.teamId ?? entity.team ?? entity.teamColor ?? entity.team_color;
                    if (direct !== undefined && direct !== null) return direct;
                    const key = Object.keys(entity).find((k) => /^team/i.test(k));
                    return key ? entity[key] : undefined;
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
                const alliedTeamIds = new Set<string>();
                squadPlayers.forEach((player: any) => {
                    const value = getTeamValue(player);
                    if (value === undefined || value === null) return;
                    alliedTeamIds.add(String(value));
                });
                const enemyTeamCounts = new Map<string, number>();
                enemyTargets.forEach((target: any) => {
                    if (target?.enemyPlayer === false) return;
                    const value = getTeamValue(target);
                    if (value === undefined || value === null) return;
                    const key = String(value);
                    // Allied IDs should not be included in enemy team columns.
                    if (alliedTeamIds.has(key)) return;
                    enemyTeamCounts.set(key, (enemyTeamCounts.get(key) || 0) + 1);
                });
                const teamBreakdown = Array.from(enemyTeamCounts.entries())
                    .sort((a, b) => {
                        const countDelta = b[1] - a[1];
                        if (countDelta !== 0) return countDelta;
                        return a[0].localeCompare(b[0], undefined, { numeric: true });
                    })
                    .slice(0, 3)
                    .map(([teamId, count]) => ({ teamId, count }));

                return {
                    id: log.filePath || `fight-${idx}`,
                    label: log.encounterName || `Fight ${idx + 1}`,
                    permalink: resolvePermalink(details, log),
                    timestamp,
                    mapName,
                    duration: resolveFightDurationLabel(details, log),
                    isWin,
                    squadCount: squadPlayers.length > 0 ? squadPlayers.length : Math.max(0, Number(summary?.squadCount || 0)),
                    allyCount: allies.length,
                    enemyCount: enemyTargets.length > 0 ? enemyTargets.length : Math.max(0, Number(summary?.enemyCount || 0)),
                    teamBreakdown,
                    alliesDown: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.downCount || 0), 0),
                    alliesDead: squadPlayers.length > 0
                        ? squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.deadCount || 0), 0)
                        : Math.max(0, Number(summary?.squadDeaths || 0)),
                    // Number of distinct allied players who were revived at least once (not total revive events).
                    alliesRevived: squadPlayers.reduce((sum: number, p: any) => (
                        Number(p.statsAll?.[0]?.saved || 0) > 0 ? sum + 1 : sum
                    ), 0),
                    rallies: 0,
                    enemyDeaths: enemyTargets.length > 0 || squadPlayers.length > 0
                        ? enemyDeaths
                        : Math.max(0, Number(summary?.enemyDeaths || 0)),
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
            });

        const commanderStats = computeCommanderStats(sortedFightLogsWithDetails);

        const fightDiffMode = computeFightDiffMode(sortedFightLogsWithDetails);

        const attendanceData = Array.from(playerStats.values())
            .map((entry) => {
                const classTimes = Object.entries(entry.professionTimeMs || {})
                    .map(([profession, timeMs]) => ({ profession, timeMs: Number(timeMs || 0) }))
                    .filter((row) => row.profession && row.profession !== 'Unknown' && row.timeMs > 0)
                    .sort((a, b) => {
                        const delta = b.timeMs - a.timeMs;
                        if (delta !== 0) return delta;
                        return a.profession.localeCompare(b.profession);
                    });
                return {
                    account: entry.account || 'Unknown',
                    characterNames: Array.from(entry.characterNames || []).filter(Boolean).sort((a, b) => a.localeCompare(b)),
                    classTimes,
                    combatTimeMs: Number(entry.squadActiveMs || entry.totalFightMs || 0),
                    squadTimeMs: (() => {
                        const firstTs = Number(entry.firstSeenFightTs || 0);
                        const lastTs = Number(entry.lastSeenFightTs || 0);
                        const lastDurationMs = Math.max(0, Number(entry.lastSeenFightDurationMs || 0));
                        if (firstTs > 0 && lastTs > 0) {
                            return Math.max(0, (lastTs + lastDurationMs) - firstTs);
                        }
                        return Number(entry.squadActiveMs || entry.totalFightMs || 0);
                    })()
                };
            })
            .filter((row) => row.account && row.account !== 'Unknown')
            .sort((a, b) => {
                const delta = b.squadTimeMs - a.squadTimeMs;
                if (delta !== 0) return delta;
                return String(a.account).localeCompare(String(b.account));
            });

        const squadCompByFight = validLogs
            .map((log) => log)
            .sort((a, b) => resolveFightTimestamp(a.details, a) - resolveFightTimestamp(b.details, b))
            .map((log, idx) => {
                const details = log?.details;
                const players = Array.isArray(details?.players) ? details.players.filter((player: any) => !player?.notInSquad) : [];
                const parties = new Map<number, {
                    party: number;
                    players: Array<{ account: string; characterName: string; profession: string; isCommander?: boolean }>;
                    classCounts: Record<string, number>;
                }>();
                players.forEach((player: any) => {
                    const partyRaw = Number(player?.group);
                    const party = Number.isFinite(partyRaw) && partyRaw > 0 ? partyRaw : 0;
                    if (!parties.has(party)) {
                        parties.set(party, { party, players: [], classCounts: {} });
                    }
                    const profession = resolveProfessionLabel(player?.profession || player?.name || 'Unknown');
                    const account = String(player?.account || 'Unknown');
                    const characterName = String(player?.name || player?.character_name || '');
                    const isCommander = Boolean(player?.hasCommanderTag);
                    const row = parties.get(party)!;
                    row.players.push({ account, characterName, profession, isCommander });
                    row.classCounts[profession] = (row.classCounts[profession] || 0) + 1;
                });
                const partyRows = Array.from(parties.values())
                    .map((row) => ({
                        ...row,
                        players: row.players.sort((a, b) => {
                            const commanderDelta = Number(Boolean(b.isCommander)) - Number(Boolean(a.isCommander));
                            if (commanderDelta !== 0) return commanderDelta;
                            const profDelta = String(a.profession).localeCompare(String(b.profession));
                            if (profDelta !== 0) return profDelta;
                            return String(a.account).localeCompare(String(b.account));
                        })
                    }))
                    .sort((a, b) => {
                        if (a.party === 0 && b.party !== 0) return 1;
                        if (b.party === 0 && a.party !== 0) return -1;
                        return a.party - b.party;
                    });
                return {
                    id: String(log?.filePath || log?.id || `fight-${idx + 1}`),
                    label: `F${idx + 1}`,
                    timestamp: resolveFightTimestamp(details, log),
                    mapName: resolveMapName(details, log),
                    duration: formatDurationMs(Number(details?.durationMS || 0)),
                    parties: partyRows
                };
            });

        const spikeDamage = computeSpikeDamageData(validLogs);

        const incomingStrikeDamage = computeIncomingStrikeDamageData(validLogs);

        const { specialTables, playerSkillBreakdowns } = computeSpecialTables(specialBuffAgg, specialBuffMeta, playerStats, playerSkillBreakdownMap, shouldIncludePlayerSkillMap);

        return {
            total, wins, losses, avgSquadSize, avgEnemies, squadKDR, enemyKDR,
            totalSquadKills, totalSquadDeaths, totalEnemyKills, totalEnemyDeaths, totalSquadDowns, totalEnemyDowns,
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
            topSkillsByDamage,
            topSkillsByDownContribution,
            playerSkillBreakdowns,
            topSkillsMetric,
            mapData, timelineData, boonTables, boonTimeline, boonUptimeTimeline,
            offensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                offenseTotals: s.offenseTotals, offenseRateWeights: s.offenseRateWeights, totalFightMs: s.totalFightMs
            })),
            defensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                defenseTotals: s.defenseTotals, activeMs: s.defenseActiveMs, minionDamageTakenByMinion: s.defenseMinionDamageTaken
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
            commanderStats,
            fightDiffMode,
            attendanceData,
            squadCompByFight,
            spikeDamage,
            incomingStrikeDamage,
            specialTables,
            topStatsPerSecond,
            topStatsLeaderboardsPerSecond: perSecondLeaderboards,
            avgMvpScore
        };
    })();

    const skillUsageData = computeSkillUsageData(validLogs);

    return {
        validLogs,
        stats,
        skillUsageData
    };
};
