
import { useMemo } from 'react';
import { applyStabilityGeneration, getPlayerCleanses, getPlayerStrips, getPlayerDownContribution, getPlayerSquadHealing, getPlayerSquadBarrier, getPlayerOutgoingCrowdControl } from "../../../shared/dashboardMetrics";
import { Player } from '../../../shared/dpsReportTypes';
import { buildBoonTables } from "../../../shared/boonGeneration";
import { DisruptionMethod, IMvpWeights, IStatsViewSettings, DEFAULT_DISRUPTION_METHOD, DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS } from '../../global.d';
import { computeOutgoingConditions, resolveConditionNameFromEntry } from '../../../shared/conditionsMetrics';
import { OFFENSE_METRICS, DEFENSE_METRICS, SUPPORT_METRICS } from '../statsMetrics';
import { isResUtilitySkill, formatDurationMs } from '../utils/dashboardUtils';
import { SkillUsageSummary, SkillUsageLogRecord, SkillUsagePlayer } from '../statsTypes';
import { PROFESSION_COLORS, getProfessionColor } from '../../../shared/professionUtils';

interface UseStatsAggregationProps {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeights;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
}

export const useStatsAggregation = ({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod }: UseStatsAggregationProps) => {

    const validLogs = useMemo(() => {
        const filtered = logs.filter(l => l.details && l.details.players && l.details.players.length > 0);
        console.log('[useStatsAggregation] Filtering logs:', {
            total: logs.length,
            passed: filtered.length,
            statuses: logs.map(l => l.status),
            hasDetails: logs.map(l => !!l.details)
        });
        return filtered;
    }, [logs]);
    const activeStatsViewSettings = statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS;
    const activeMvpWeights = mvpWeights || DEFAULT_MVP_WEIGHTS;

    const stats = useMemo(() => {
        if (precomputedStats) {
            return precomputedStats;
        }

        const method = disruptionMethod || DEFAULT_DISRUPTION_METHOD;
        const total = validLogs.length;

        let wins = 0;
        let losses = 0;
        let totalSquadSizeAccum = 0;
        let totalEnemiesAccum = 0;
        let totalSquadDeaths = 0;
        let totalSquadKills = 0;
        let totalEnemyDeaths = 0;
        let totalEnemyKills = 0;

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
        const skillDamageMap: Record<number, { name: string, damage: number, hits: number }> = {};
        const incomingSkillDamageMap: Record<number, { name: string, damage: number, hits: number }> = {};
        const outgoingCondiTotals: Record<string, any> = {};
        const incomingCondiTotals: Record<string, any> = {};
        const enemyProfessionCounts: Record<string, number> = {};
        const specialBuffMeta = new Map<string, { name?: string; stacking?: boolean }>();
        const specialBuffAgg = new Map<string, Map<string, {
            account: string;
            profession: string;
            professions: Set<string>;
            professionTimeMs: Record<string, number>;
            totalMs: number;
            durationMs: number;
        }>>();
        const knownProfessionNames = new Set(Object.keys(PROFESSION_COLORS));
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
            const cleaned = String(name).replace(/\s\d+$/, '');
            if (knownProfessionNames.has(cleaned)) return cleaned;
            const lower = cleaned.toLowerCase();
            const baseMatch = baseProfessionNames.find((prof) => lower.includes(prof.toLowerCase()));
            return baseMatch || cleaned || 'Unknown';
        };
        const isBoon = (meta?: { classification?: string }) => {
            if (!meta?.classification) return true;
            return meta.classification === 'Boon';
        };

        console.log('[useStatsAggregation] Starting aggregation loop', { validLogsCount: validLogs.length });

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
            const enemyPlayers = players.filter(p => p.notInSquad);
            totalSquadSizeAccum += squadPlayers.length;
            totalEnemiesAccum += targets.filter((t: any) => !t.isFake).length;

            applyStabilityGeneration(players, { durationMS: details.durationMS, buffMap: details.buffMap });

            let squadDownsDeaths = 0;
            let enemyDownsDeaths = 0;
            let logSquadDeaths = 0;
            let logEnemyKills = 0;

            squadPlayers.forEach(p => {
                if (p.defenses?.[0]) {
                    squadDownsDeaths += (p.defenses[0].downCount || 0) + (p.defenses[0].deadCount || 0);
                    logSquadDeaths += p.defenses[0].deadCount || 0;
                }
            });
            totalSquadDeaths += logSquadDeaths;
            totalEnemyKills += logSquadDeaths;

            players.forEach((p: any) => {
                if (p.notInSquad && p.statsTargets) {
                    p.statsTargets.forEach((stList: any) => {
                        const st = stList?.[0];
                        if (st) {
                            enemyDownsDeaths += (st.downed || 0) + (st.killed || 0);
                            logEnemyKills += st.killed || 0;
                        }
                    });
                }
            });
            totalSquadKills += logEnemyKills;
            totalEnemyDeaths += logEnemyKills;

            if (squadDownsDeaths < enemyDownsDeaths) wins++; else losses++;

            players.forEach(p => {
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
                        if (!Number.isFinite(uptime) || uptime <= 0) return;
                        const stacking = meta?.stacking ?? false;
                        const uptimeFactor = stacking ? uptime : uptime / 100;
                        const totalMs = uptimeFactor * activeMs;
                        if (!Number.isFinite(totalMs) || totalMs <= 0) return;

                        if (!specialBuffMeta.has(buffId)) {
                            specialBuffMeta.set(buffId, { name: meta?.name, stacking });
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
                        agg.totalMs += totalMs;
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
                const addHealing = (key: string, val: number) => { if (Number.isFinite(val)) s.healingTotals[key] = (s.healingTotals[key] || 0) + val; };
                if (Array.isArray(p.rotation)) {
                    let resCasts = 0;
                    p.rotation.forEach((rot: any) => {
                        if (!rot?.id || !isResUtilitySkill(rot.id, details.skillMap)) return;
                        const count = rot.skills?.length || 0;
                        if (count > 0) { resCasts += count; addHealing(`resUtility_s${rot.id}`, count); }
                    });
                    if (resCasts > 0) addHealing('resUtility', resCasts);
                }
                // (Ext Healing/Barrier omitted for brevity but should be here ideally, keeping simple for now)

                // Offense
                const statsAll = p.statsAll?.[0];
                const dpsAll = p.dpsAll?.[0];
                OFFENSE_METRICS.forEach(m => {
                    if (m.id === 'downContributionPercent') return;
                    if (!m.field) return;
                    let val = 0;
                    let denom = 0;
                    if (m.source === 'dpsAll' && dpsAll) val = Number((dpsAll as any)[m.field!] ?? 0);
                    else if (m.source === 'statsAll' && statsAll) {
                        val = Number((statsAll as any)[m.field!] ?? 0);
                        denom = Number((statsAll as any)[m.denomField || m.weightField || 'connectedDamageCount'] ?? 0);
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

                s.revives += p.support?.[0]?.resurrects || 0;
                if (dpsAll) {
                    s.damage += dpsAll.damage || 0;
                    s.dps += dpsAll.dps || 0;
                }

                // Skill Damage (Global)
                if (p.totalDamageDist) {
                    p.totalDamageDist.forEach((list: any) => {
                        list?.forEach((entry: any) => {
                            if (!entry?.id) return;
                            let name = `Skill ${entry.id}`;
                            const mapped = details.skillMap?.[`s${entry.id}`] || details.skillMap?.[`${entry.id}`];
                            if (mapped?.name) name = mapped.name;
                            if (!skillDamageMap[entry.id]) skillDamageMap[entry.id] = { name, damage: 0, hits: 0 };
                            if (!skillDamageMap[entry.id].name.startsWith('Skill ') || name.startsWith('Skill ')) skillDamageMap[entry.id].name = name;
                            skillDamageMap[entry.id].damage += entry.totalDamage;
                            skillDamageMap[entry.id].hits += entry.connectedHits;
                        });
                    });
                }
                if (p.totalDamageTaken) {
                    p.totalDamageTaken.forEach((list: any) => {
                        list?.forEach((entry: any) => {
                            if (!entry?.id) return;
                            let name = `Skill ${entry.id}`;
                            const mapped = details.skillMap?.[`s${entry.id}`] || details.skillMap?.[`${entry.id}`];
                            if (mapped?.name) name = mapped.name;
                            if (!incomingSkillDamageMap[entry.id]) incomingSkillDamageMap[entry.id] = { name, damage: 0, hits: 0 };
                            if (!incomingSkillDamageMap[entry.id].name.startsWith('Skill ') || name.startsWith('Skill ')) incomingSkillDamageMap[entry.id].name = name;
                            incomingSkillDamageMap[entry.id].damage += entry.totalDamage;
                            incomingSkillDamageMap[entry.id].hits += entry.hits;
                        });
                    });
                }
            });

            enemyPlayers.forEach((p: any) => {
                const name = resolveProfessionLabel(p.profession || p.name);
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
            Object.entries(conditionResult.playerConditions).forEach(([k, totals]) => {
                const ps = playerStats.get(k);
                if (!ps) return;
                Object.entries(totals).forEach(([cName, v]) => {
                    const ex = ps.outgoingConditions[cName] || { applications: 0, damage: 0, skills: {} };
                    ex.applications += Number(v.applications || 0);
                    ex.damage += Number(v.damage || 0);
                    if (v.applicationsFromBuffs) ex.applicationsFromBuffs = (ex.applicationsFromBuffs || 0) + v.applicationsFromBuffs;
                    if (v.applicationsFromBuffsActive) ex.applicationsFromBuffsActive = (ex.applicationsFromBuffsActive || 0) + v.applicationsFromBuffsActive;
                    Object.entries(v.skills || {}).forEach(([sn, sv]) => {
                        const sk = ex.skills[sn] || { name: sv.name, hits: 0, damage: 0 };
                        sk.hits += Number(sv.hits || 0);
                        sk.damage += Number(sv.damage || 0);
                        ex.skills[sn] = sk;
                    });
                    ps.outgoingConditions[cName] = ex;
                });
            });
            Object.entries(conditionResult.summary).forEach(([cName, v]) => {
                const ex = outgoingCondiTotals[cName] || { name: v.name || cName, applications: 0, damage: 0 };
                ex.applications += Number(v.applications || 0);
                ex.damage += Number(v.damage || 0);
                if (v.applicationsFromBuffs) ex.applicationsFromBuffs = (ex.applicationsFromBuffs || 0) + v.applicationsFromBuffs;
                if (v.applicationsFromBuffsActive) ex.applicationsFromBuffsActive = (ex.applicationsFromBuffsActive || 0) + v.applicationsFromBuffsActive;
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
                    const hits = Number(entry.hits ?? 0);
                    const dmg = Number(entry.totalDamage ?? 0);

                    const summ = incomingCondiTotals[finalName] || { name: finalName, applications: 0, damage: 0 };
                    summ.applications += Number.isFinite(hits) ? hits : 0;
                    summ.damage += Number.isFinite(dmg) ? dmg : 0;
                    incomingCondiTotals[finalName] = summ;

                    const pEntry = ps.incomingConditions[finalName] || { applications: 0, damage: 0, skills: {} };
                    pEntry.applications += Number.isFinite(hits) ? hits : 0;
                    pEntry.damage += Number.isFinite(dmg) ? dmg : 0;
                    const skEntry = pEntry.skills[sName] || { name: sName, hits: 0, damage: 0 };
                    skEntry.hits += Number.isFinite(hits) ? hits : 0;
                    skEntry.damage += Number.isFinite(dmg) ? dmg : 0;
                    pEntry.skills[sName] = skEntry;
                    ps.incomingConditions[finalName] = pEntry;
                }));
            });

        }); // End Logs Loop

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
            const scores: any[] = [];
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
                scores.push({ ...stat, score, contribs });
            });
            scores.sort((a, b) => b.score - a.score);
            if (scores[0]) {
                const topContrib = [...scores[0].contribs].sort((a, b) => b.ratio - a.ratio)[0];
                mvp = {
                    ...scores[0],
                    player: scores[0].name,
                    reason: topContrib?.name || 'Top Performance',
                    topStats: scores[0].contribs.slice(0, 3)
                };
            }
            silver = scores[1];
            bronze = scores[2];

            avgMvpScore = scores.length > 0
                ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
                : 0;
        }

        const topSkills = Object.values(skillDamageMap).sort((a, b) => b.damage - a.damage).slice(0, 25);
        const topIncomingSkills = Object.values(incomingSkillDamageMap).sort((a, b) => b.damage - a.damage).slice(0, 25);

        // Map Data
        const normalizeMapLabel = (value: any) => {
            if (!value) return 'Unknown';
            return String(value).replace(/^Detailed\s*WvW\s*-\s*/i, '').trim() || 'Unknown';
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

        const mapCounts: Record<string, number> = {};
        validLogs.forEach((log) => {
            const name = resolveMapName(log?.details, log);
            mapCounts[name] = (mapCounts[name] || 0) + 1;
        });
        const mapData = Object.entries(mapCounts)
            .map(([name, value]) => {
                const isEbg = /eternal battlegrounds|^ebg$/i.test(String(name).trim());
                return { name, value, color: isEbg ? '#ffffff' : '#64748b' };
            })
            .sort((a, b) => b.value - a.value);

        const { boonTables } = buildBoonTables(validLogs);

        const timelineData = validLogs.map((log, i) => ({
            index: i + 1,
            label: `Log ${i + 1}`,
            timestamp: log.details?.uploadTime || 0,
            squadCount: (log.details?.players as any[]).filter(p => !p.notInSquad).length,
            enemies: (log.details?.targets as any[]).filter(t => !t.isFake).length
        })).sort((a, b) => a.timestamp - b.timestamp);

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

        // 2. Enemy Class Data (Top 10)
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
        })).sort((a, b) => b.value - a.value).slice(0, 10);

        // 3. Fight Breakdown
        const fightBreakdown = validLogs
            .map((log, originalIndex) => { return { log, originalIndex }; })
            .sort((a, b) => (a.log.details?.uploadTime || 0) - (b.log.details?.uploadTime || 0))
            .map(({ log }, idx) => {
                const details = log.details;
                if (!details) return null;
                const players = details.players || [];
                const squadPlayers = players.filter((p: any) => !p.notInSquad);
                const allies = players.filter((p: any) => p.notInSquad);
                const targets = details.targets || [];
                const totalOutgoing = players.reduce((sum: number, p: any) => sum + (p.dpsAll?.[0]?.damage || 0), 0);
                const totalIncoming = players.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.damageTaken || 0), 0);
                const timestamp = details.uploadTime ?? log.uploadTime ?? 0;
                const mapName = resolveMapName(details, log);
                const teamCounts = { red: 0, green: 0, blue: 0 };
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
                if (details.teamCounts && typeof details.teamCounts === 'object') {
                    teamCounts.red = Number(details.teamCounts.red || details.teamCounts.r || 0);
                    teamCounts.green = Number(details.teamCounts.green || details.teamCounts.g || 0);
                    teamCounts.blue = Number(details.teamCounts.blue || details.teamCounts.b || 0);
                } else {
                    const teamValues: any[] = [];
                    targets.forEach((t: any) => {
                        if (t?.isFake) return;
                        const value = t.teamID ?? t.team ?? t.teamColor;
                        if (value !== undefined && value !== null) teamValues.push(value);
                    });
                    players.forEach((p: any) => {
                        if (!p?.notInSquad) return;
                        const value = p.teamID ?? p.team ?? p.teamColor;
                        if (value !== undefined && value !== null) teamValues.push(value);
                    });
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
                }

                return {
                    id: log.filePath || `fight-${idx}`,
                    label: log.encounterName || `Fight ${idx + 1}`,
                    permalink: log.permalink,
                    timestamp,
                    mapName,
                    duration: formatDurationMs(details.durationMS),
                    isWin: !!details.success,
                    squadCount: squadPlayers.length,
                    allyCount: allies.length,
                    enemyCount: targets.length,
                    teamCounts,
                    alliesDown: players.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.downCount || 0), 0),
                    alliesDead: players.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.deadCount || 0), 0),
                    alliesRevived: players.reduce((sum: number, p: any) => sum + (p.statsAll?.[0]?.saved || 0), 0),
                    rallies: 0,
                    enemyDeaths: targets.reduce((sum: number, t: any) => sum + (t.isFake ? 0 : 1), 0),
                    totalOutgoingDamage: totalOutgoing,
                    totalIncomingDamage: totalIncoming,
                    incomingBarrierAbsorbed: players.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.damageBarrier || 0), 0),
                    outgoingBarrierAbsorbed: players.reduce((sum: number, p: any) => sum + (p.statsAll?.[0]?.damageBarrier || 0), 0)
                };
            })
            .filter(Boolean);

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
                return {
                    account: entry.account,
                    profession: primaryProfession,
                    professionList,
                    total,
                    perSecond,
                    duration: durationMs / 1000
                };
            }).filter((row) => row.total > 0 || row.perSecond > 0);
            return {
                id: buffId,
                name: meta.name || buffId,
                rows
            };
        }).filter((table) => table.rows.length > 0);

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
            mapData, timelineData, boonTables,
            offensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                offenseTotals: s.offenseTotals, offenseRateWeights: s.offenseRateWeights, totalFightMs: s.totalFightMs
            })),
            defensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                defenseTotals: s.defenseTotals, activeMs: s.defenseActiveMs
            })),
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
            specialTables,
            topStatsPerSecond,
            topStatsLeaderboardsPerSecond: perSecondLeaderboards,
            avgMvpScore
        };
    }, [validLogs, precomputedStats, disruptionMethod, activeMvpWeights, activeStatsViewSettings]);

    const skillUsageData = useMemo<SkillUsageSummary>(() => {
        const skillTotals = new Map<string, number>();
        const playerMap = new Map<string, SkillUsagePlayer>();
        const logRecords: SkillUsageLogRecord[] = [];
        const skillNameMap = new Map<string, string>();

        validLogs.forEach((log) => {
            const details = log.details;
            if (!details) return;
            const skillMap = details.skillMap || {};
            const label = details.fightName || 'Log';
            const timestamp = details.uploadTime ?? log.uploadTime ?? Date.now();

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
                    pr!.skillTotals[sId] = (pr!.skillTotals[sId] || 0) + count;
                    skillTotals.set(sId, (skillTotals.get(sId) || 0) + count);
                    skillNameMap.set(sId, sName);

                    if (!record.skillEntries[sId]) record.skillEntries[sId] = { name: sName, players: {} };
                    record.skillEntries[sId].players[key] = (record.skillEntries[sId].players[key] || 0) + count;
                });
            });
            logRecords.push(record);
        });

        const skillOptions = Array.from(skillTotals.entries()).map(([id, total]) => ({
            id, name: skillNameMap.get(id) || id, total
        })).sort((a, b) => b.total - a.total);

        return {
            logRecords,
            players: Array.from(playerMap.values()),
            skillOptions,
            resUtilitySkills: []
        };
    }, [validLogs]);

    return {
        validLogs,
        stats,
        skillUsageData
    };
};
