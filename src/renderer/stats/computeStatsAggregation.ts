
import { DisruptionMethod, IMvpWeights, IStatsViewSettings, DEFAULT_DISRUPTION_METHOD, DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';
import { formatDurationMs } from './utils/dashboardUtils';
import { getProfessionColor } from '../../shared/professionUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { computeSkillUsageData } from './computeSkillUsageData';
import { computeSpikeDamageData } from './computeSpikeDamageData';
import { computeIncomingStrikeDamageData } from './computeIncomingStrikeDamageData';
import { computeCommanderStats } from './computeCommanderStats';
import { resolveMapName } from './utils/labelUtils';
import { computeTimelineAndMapData } from './computeTimelineAndMapData';
import { computeFightDiffMode } from './computeFightDiffMode';
import { computeSpecialTables } from './computeSpecialTables';
import { computePlayerAggregation, PlayerStats, DamageMitigationRow, DamageMitigationTotals, resolveProfessionLabel } from './computePlayerAggregation';
import { computeFightBreakdown } from './computeFightBreakdown';

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

        const {
            playerStats, skillDamageMap, incomingSkillDamageMap, playerSkillBreakdownMap,
            outgoingCondiTotals, incomingCondiTotals, enemyProfessionCounts,
            specialBuffMeta, specialBuffAgg,
            damageMitigationPlayersMap, damageMitigationMinionsMap,
            wins, losses, totalSquadSizeAccum, totalEnemiesAccum,
            totalSquadDeaths, totalSquadKills, totalEnemyDeaths, totalEnemyKills,
            totalSquadDowns, totalEnemyDowns,
        } = computePlayerAggregation({
            validLogs,
            method,
            skillDamageSource,
        });

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

        const hasMitigationTotals = (totals: DamageMitigationTotals) => Object.values(totals).some((value) => value > 0);

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
        const fightBreakdown = computeFightBreakdown(sortedFightLogs);

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
