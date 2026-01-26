import { useMemo, useState } from 'react';
import { ArrowLeft, Trophy, Share2, Swords, Shield, Zap, Activity, Flame, HelpingHand, Hammer, ShieldCheck, Crosshair, Map as MapIcon, Users, Skull, Wind, Crown, Sparkles, Star } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend as ChartLegend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { toPng } from 'html-to-image';
import { calculateAllStability, calculateSquadBarrier, calculateSquadHealing, calculateOutCC, calculateDownContribution } from '../shared/plenbot';
import { Player, Target } from '../shared/dpsReportTypes';
import { getProfessionColor, getProfessionIconPath } from '../shared/professionUtils';
import { DEFAULT_MVP_WEIGHTS, IMvpWeights } from './global.d';

interface StatsViewProps {
    logs: ILogData[];
    onBack: () => void;
    mvpWeights?: IMvpWeights;
}

export function StatsView({ logs, onBack, mvpWeights }: StatsViewProps) {
    const [sharing, setSharing] = useState(false);
    const [expandedLeader, setExpandedLeader] = useState<string | null>(null);

    const stats = useMemo(() => {
        const validLogs = logs.filter(l => (l.status === 'success' || l.status === 'discord') && l.details);
        const total = validLogs.length;

        // Wins/Losses (Combat Stat Based)
        let wins = 0;
        let losses = 0;

        // --- Player Aggregation ---
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
            profession: string;
            damage: number;
            dps: number;
            revives: number;
        }

        const playerStats = new Map<string, PlayerStats>();

        // --- Skill Aggregation ---
        // skillId -> { name, damage, hits }
        const skillDamageMap: Record<number, { name: string, damage: number, hits: number }> = {};
        const incomingSkillDamageMap: Record<number, { name: string, damage: number, hits: number }> = {};

        let totalSquadSizeAccum = 0;
        let totalEnemiesAccum = 0;

        // KDR Tracking
        let totalSquadDeaths = 0;
        let totalSquadKills = 0; // Enemies we killed
        let totalEnemyDeaths = 0; // Same as squad kills, but from enemy perspective
        let totalEnemyKills = 0; // How many of us they killed

        validLogs.forEach(log => {
            const details = log.details;
            if (!details) return;
            const players = details.players as unknown as Player[];
            const targets = details.targets || [];
            const getDistanceToTag = (p: any) => {
                const stats = p.statsAll?.[0];
                const distToCom = stats?.distToCom;
                if (distToCom !== undefined && distToCom !== null) {
                    return distToCom;
                }
                const stackDist = stats?.stackDist;
                return stackDist || 0;
            };

            // Squad/Enemy Counts
            const squadCount = players.filter(p => !p.notInSquad).length;
            const enemyCount = targets.filter((t: any) => !t.isFake).length;
            totalSquadSizeAccum += squadCount;
            totalEnemiesAccum += enemyCount;

            // 1. Calculate Win/Loss based on Downs/Deaths
            let squadDownsDeaths = 0;
            let enemyDownsDeaths = 0;

            // Squad Downs/Deaths - from our players' defenses
            let logSquadDeaths = 0;
            players.forEach(p => {
                if (!p.notInSquad && p.defenses && p.defenses.length > 0) {
                    squadDownsDeaths += (p.defenses[0].downCount || 0) + (p.defenses[0].deadCount || 0);
                    logSquadDeaths += p.defenses[0].deadCount || 0;
                }
            });
            totalSquadDeaths += logSquadDeaths;
            totalEnemyKills += logSquadDeaths; // Enemy killed us

            // Enemy Downs/Deaths - from statsTargets (what WE did to them)
            let logEnemyKills = 0;
            players.forEach((p: any) => {
                if (p.notInSquad) return;
                if (p.statsTargets && p.statsTargets.length > 0) {
                    p.statsTargets.forEach((targetStats: any) => {
                        if (targetStats && targetStats.length > 0) {
                            const st = targetStats[0];
                            enemyDownsDeaths += (st.downed || 0) + (st.killed || 0);
                            logEnemyKills += st.killed || 0;
                        }
                    });
                }
            });
            totalSquadKills += logEnemyKills;
            totalEnemyDeaths += logEnemyKills;

            if (squadDownsDeaths < enemyDownsDeaths) {
                wins++;
            } else {
                losses++;
            }

            // Pre-calculate stab for this log's players
            calculateAllStability(players);

            players.forEach(p => {
                // Only process squad members, not allies
                if (p.notInSquad) return;

                // Determine Identity
                const account = p.account || 'Unknown';
                // We key by account to aggregate totals across characters
                const key = account !== 'Unknown' ? account : (p.name || 'Unknown');
                const name = p.name || 'Unknown'; // Helper name (last seen character name usually)

                if (!playerStats.has(key)) {
                    playerStats.set(key, {
                        name: name,
                        account: account !== 'Unknown' ? account : name,
                        downContrib: 0,
                        cleanses: 0,
                        strips: 0,
                        stab: 0,
                        healing: 0,
                        barrier: 0,
                        cc: 0,
                        logsJoined: 0,
                        totalDist: 0,
                        distCount: 0,
                        dodges: 0,
                        profession: p.profession || 'Unknown',
                        damage: 0,
                        dps: 0,
                        revives: 0
                    });
                }

                const s = playerStats.get(key)!;
                if (p.profession) s.profession = p.profession;
                s.logsJoined++;

                // Aggregate Metrics
                // Down Contribution
                s.downContrib += calculateDownContribution(p);

                // Support: Cleanses and Strips (PlenBot uses condiCleanse + condiCleanseSelf)
                s.cleanses += (p.support?.[0]?.condiCleanse || 0) + (p.support?.[0]?.condiCleanseSelf || 0);
                s.strips += p.support?.[0]?.boonStrips || 0;

                // PlenBot calcs
                s.healing += calculateSquadHealing(p);
                s.barrier += calculateSquadBarrier(p);
                s.cc += calculateOutCC(p);
                s.stab += p.stabGeneration || 0;

                // Stack Distance (Distance to Tag)
                // statsAll[0] contains the stackDist field in Elite Insights JSON
                if (p.statsAll && p.statsAll.length > 0) {
                    const dist = getDistanceToTag(p);
                    if (dist > 0) {
                        s.totalDist += dist;
                        s.distCount++;
                    }
                }

                // Dodges
                if (p.defenses && p.defenses.length > 0) {
                    s.dodges += p.defenses[0].dodgeCount || 0;
                }

                s.revives += p.support?.[0]?.resurrects || 0;

                if (p.dpsAll && p.dpsAll.length > 0) {
                    s.damage += p.dpsAll[0].damage || 0;
                    s.dps += p.dpsAll[0].dps || 0;
                }

                // Outgoing Skill Aggregation
                if (p.totalDamageDist) {
                    p.totalDamageDist.forEach(distList => {
                        if (!distList) return;
                        distList.forEach(entry => {
                            if (!entry.id) return;

                            let skillName = `Skill ${entry.id}`;
                            // Attempt to resolve name from skillMap
                            if (details.skillMap) {
                                if (details.skillMap[`s${entry.id}`]) {
                                    skillName = details.skillMap[`s${entry.id}`].name;
                                } else if (details.skillMap[`${entry.id}`]) {
                                    skillName = details.skillMap[`${entry.id}`].name;
                                }
                            }

                            if (!skillDamageMap[entry.id]) {
                                skillDamageMap[entry.id] = { name: skillName, damage: 0, hits: 0 };
                            }
                            // Update name if we found a better one
                            if (skillDamageMap[entry.id].name.startsWith('Skill ') && !skillName.startsWith('Skill ')) {
                                skillDamageMap[entry.id].name = skillName;
                            }

                            skillDamageMap[entry.id].damage += entry.totalDamage;
                            skillDamageMap[entry.id].hits += entry.connectedHits;
                        });
                    });
                }

                // Incoming Skill Aggregation (Damage Taken)
                if (p.totalDamageTaken) {
                    p.totalDamageTaken.forEach(takenList => {
                        if (!takenList) return;
                        takenList.forEach(entry => {
                            if (!entry.id) return;

                            let skillName = `Skill ${entry.id}`;
                            // Resolve name
                            if (details.skillMap) {
                                if (details.skillMap[`s${entry.id}`]) {
                                    skillName = details.skillMap[`s${entry.id}`].name;
                                } else if (details.skillMap[`${entry.id}`]) {
                                    skillName = details.skillMap[`${entry.id}`].name;
                                }
                            }

                            if (!incomingSkillDamageMap[entry.id]) {
                                incomingSkillDamageMap[entry.id] = { name: skillName, damage: 0, hits: 0 };
                            }
                            if (incomingSkillDamageMap[entry.id].name.startsWith('Skill ') && !skillName.startsWith('Skill ')) {
                                incomingSkillDamageMap[entry.id].name = skillName;
                            }

                            incomingSkillDamageMap[entry.id].damage += entry.totalDamage;
                            incomingSkillDamageMap[entry.id].hits += entry.hits; // For taken, hits is usually raw hits
                        });
                    });
                }
            });
        });

        const avgSquadSize = total > 0 ? Math.round(totalSquadSizeAccum / total) : 0;
        const avgEnemies = total > 0 ? Math.round(totalEnemiesAccum / total) : 0;

        // Find Leaders
        const emptyLeader = { value: 0, player: '-', count: 0, profession: 'Unknown' };

        let maxDownContrib = { ...emptyLeader };
        let maxCleanses = { ...emptyLeader };
        let maxStrips = { ...emptyLeader };
        let maxStab = { ...emptyLeader };
        let maxHealing = { ...emptyLeader };
        let maxBarrier = { ...emptyLeader };
        let maxCC = { ...emptyLeader };
        let maxDodges = { ...emptyLeader };
        let maxLogsJoined = 0;
        let closestToTag = { value: 999999, player: '-', count: 0, profession: 'Unknown' }; // Min is better
        let maxDamage = { ...emptyLeader };
        let maxDps = { ...emptyLeader };
        let maxRevives = { ...emptyLeader };

        const playerEntries = Array.from(playerStats.entries()).map(([key, stat]) => ({ key, stat }));

        playerEntries.forEach(({ stat }) => {
            const pInfo = { player: stat.account, count: stat.logsJoined, profession: stat.profession || 'Unknown' };

            if (stat.downContrib > maxDownContrib.value) maxDownContrib = { value: stat.downContrib, ...pInfo };
            if (stat.cleanses > maxCleanses.value) maxCleanses = { value: stat.cleanses, ...pInfo };
            if (stat.strips > maxStrips.value) maxStrips = { value: stat.strips, ...pInfo };
            if (stat.stab > maxStab.value) maxStab = { value: stat.stab, ...pInfo };
            if (stat.healing > maxHealing.value) maxHealing = { value: stat.healing, ...pInfo };
            if (stat.barrier > maxBarrier.value) maxBarrier = { value: stat.barrier, ...pInfo };
            if (stat.cc > maxCC.value) maxCC = { value: stat.cc, ...pInfo };
            if (stat.dodges > maxDodges.value) maxDodges = { value: stat.dodges, ...pInfo };
            if (stat.damage > maxDamage.value) maxDamage = { value: stat.damage, ...pInfo };
            if (stat.dps > maxDps.value) maxDps = { value: stat.dps, ...pInfo };
            if (stat.revives > maxRevives.value) maxRevives = { value: stat.revives, ...pInfo };
            if (stat.logsJoined > maxLogsJoined) maxLogsJoined = stat.logsJoined;

            if (stat.distCount > 0) {
                const avgDist = stat.totalDist / stat.distCount;
                if (avgDist > 0 && avgDist < closestToTag.value) {
                    closestToTag = { value: avgDist, ...pInfo };
                }
            }
        });

        if (closestToTag.value === 999999) closestToTag.value = 0;

        const buildLeaderboard = (items: Array<{ key: string; account: string; profession: string; value: number }>, higherIsBetter: boolean) => {
            const filtered = items.filter(item => Number.isFinite(item.value) && item.value > 0);
            const sorted = filtered.sort((a, b) => {
                const diff = higherIsBetter ? b.value - a.value : a.value - b.value;
                if (diff !== 0) return diff;
                return a.account.localeCompare(b.account);
            });
            let lastValue: number | null = null;
            let lastRank = 0;
            return sorted.map((item, index) => {
                if (lastValue === null || item.value !== lastValue) {
                    lastRank = index + 1;
                    lastValue = item.value;
                }
                return {
                    rank: lastRank,
                    account: item.account,
                    profession: item.profession,
                    value: item.value
                };
            });
        };

        const leaderboards = {
            downContrib: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.downContrib
            })), true),
            barrier: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.barrier
            })), true),
            healing: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.healing
            })), true),
            dodges: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.dodges
            })), true),
            strips: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.strips
            })), true),
            cleanses: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.cleanses
            })), true),
            cc: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.cc
            })), true),
            stability: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.stab
            })), true),
            closestToTag: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                value: stat.distCount > 0 ? stat.totalDist / stat.distCount : Number.POSITIVE_INFINITY
            })).filter(item => Number.isFinite(item.value)), false)
        };

        const buildRankMap = (items: Array<{ key: string; value: number }>, higherIsBetter: boolean) => {
            const sorted = [...items].sort((a, b) => {
                const diff = higherIsBetter ? b.value - a.value : a.value - b.value;
                if (diff !== 0) return diff;
                return a.key.localeCompare(b.key);
            });
            const ranks: Record<string, number> = {};
            let lastValue: number | null = null;
            let lastRank = 0;
            sorted.forEach((item, index) => {
                if (lastValue === null || item.value !== lastValue) {
                    lastRank = index + 1;
                    lastValue = item.value;
                }
                ranks[item.key] = lastRank;
            });
            return ranks;
        };

        const rankMaps = {
            downContrib: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.downContrib })), true),
            healing: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.healing })), true),
            cleanses: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.cleanses })), true),
            strips: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.strips })), true),
            stability: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.stab })), true),
            cc: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.cc })), true),
            revives: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.revives })), true),
            participation: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.logsJoined })), true),
            dodging: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.dodges })), true),
            dps: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.dps })), true),
            damage: buildRankMap(playerEntries.map(({ key, stat }) => ({ key, value: stat.damage })), true),
            distanceToTag: buildRankMap(playerEntries.map(({ key, stat }) => ({
                key,
                value: stat.distCount > 0 ? stat.totalDist / stat.distCount : Number.POSITIVE_INFINITY
            })).filter(item => Number.isFinite(item.value)), false)
        };

        // --- Calculate MVP ---
        // --- Calculate MVP ---
        let mvp = {
            player: 'None',
            account: 'None',
            reason: 'No sufficient data',
            score: -1,
            profession: 'Unknown',
            color: '#64748b',
            topStats: [] as { name: string, val: string, ratio: number }[]
        };

        let totalScoreSum = 0;
        const scoreBreakdown: Array<{
            player: string;
            account: string;
            profession: string;
            score: number;
            reason: string;
            topStats: { name: string, val: string, ratio: number }[];
        }> = [];

        playerEntries.forEach(({ key, stat }) => {
            let score = 0;
            const contributions: { name: string, ratio: number, value: number, fmt: string, rank: number }[] = [];

            const formatCompactNumber = (value: number) => {
                const abs = Math.abs(value);
                if (abs >= 1_000_000) {
                    return `${(value / 1_000_000).toFixed(2)}m`;
                }
                if (abs >= 1_000) {
                    return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
                }
                return Math.round(value).toLocaleString();
            };

            const weights = mvpWeights || DEFAULT_MVP_WEIGHTS;

            const check = (val: number, maxVal: number, name: string, weight = 1, rankMap?: Record<string, number>) => {
                if (maxVal > 0) {
                    const ratio = val / maxVal;
                    score += ratio * weight;
                    const rank = rankMap?.[key] || 0;
                    contributions.push({ name, ratio, value: val, fmt: formatCompactNumber(val), rank });
                }
            };
            const checkLowerIsBetter = (val: number, bestVal: number, name: string, weight = 1, rankMap?: Record<string, number>) => {
                if (bestVal > 0 && val > 0) {
                    const ratio = bestVal / val;
                    score += ratio * weight;
                    const rank = rankMap?.[key] || 0;
                    contributions.push({ name, ratio, value: val, fmt: formatCompactNumber(val), rank });
                }
            };

            check(stat.downContrib, maxDownContrib.value, 'Down Contribution', weights.downContribution, rankMaps.downContrib);
            check(stat.healing, maxHealing.value, 'Healing', weights.healing, rankMaps.healing);
            check(stat.cleanses, maxCleanses.value, 'Cleanses', weights.cleanses, rankMaps.cleanses);
            check(stat.strips, maxStrips.value, 'Strips', weights.strips, rankMaps.strips);
            check(stat.stab, maxStab.value, 'Stability', weights.stability, rankMaps.stability);
            check(stat.cc, maxCC.value, 'CC', weights.cc, rankMaps.cc);
            check(stat.revives, maxRevives.value, 'Revives', weights.revives, rankMaps.revives);
            check(stat.logsJoined, maxLogsJoined, 'Participation', weights.participation, rankMaps.participation);
            check(stat.dodges, maxDodges.value, 'Dodging', weights.dodging, rankMaps.dodging);
            check(stat.dps, maxDps.value, 'DPS', weights.dps, rankMaps.dps);
            check(stat.damage, maxDamage.value, 'Damage', weights.damage, rankMaps.damage);
            if (stat.distCount > 0) {
                const avgDist = stat.totalDist / stat.distCount;
                checkLowerIsBetter(avgDist, closestToTag.value, 'Distance to Tag', weights.distanceToTag, rankMaps.distanceToTag);
            }

            totalScoreSum += score;

            contributions.sort((a, b) => b.ratio - a.ratio);
            const top3 = contributions.slice(0, 3);

            let reason = 'Consistent all-round performance';
            if (top3.length > 0) {
                const best = top3[0];
                if (best.ratio >= 1) {
                    reason = `Top Rank in ${best.name}`;
                    if (top3.length > 1 && top3[1].ratio > 0.8) {
                        reason += ` & High ${top3[1].name}`;
                    }
                } else if (best.ratio > 0.8) {
                    reason = `High ${best.name} & ${top3[1]?.name || 'Performance'}`;
                } else {
                    reason = `Versatile: ${best.name}, ${top3[1]?.name}`;
                }
            }

            const summary = {
                player: stat.name,
                account: stat.account,
                profession: stat.profession,
                score,
                reason,
                topStats: top3.map(c => ({ name: c.name, val: c.fmt, ratio: c.rank }))
            };

            scoreBreakdown.push(summary);
        });

        scoreBreakdown.sort((a, b) => b.score - a.score);
        const silver = scoreBreakdown[1];
        const bronze = scoreBreakdown[2];
        if (scoreBreakdown[0]) {
            const top = scoreBreakdown[0];
            mvp = {
                player: top.player,
                account: top.account,
                reason: top.reason,
                score: top.score,
                profession: top.profession,
                color: getProfessionColor(top.profession),
                topStats: top.topStats
            };
        }

        const avgMvpScore = playerStats.size > 0 ? totalScoreSum / playerStats.size : 0;

        // Sort Skills
        const topSkills = Object.values(skillDamageMap)
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 5);

        const topIncomingSkills = Object.values(incomingSkillDamageMap)
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 5);

        // KDR Calculations
        const squadKDR = totalSquadDeaths > 0 ? (totalSquadKills / totalSquadDeaths).toFixed(2) : totalSquadKills > 0 ? '∞' : '0.00';
        const enemyKDR = totalEnemyDeaths > 0 ? (totalEnemyKills / totalEnemyDeaths).toFixed(2) : totalEnemyKills > 0 ? '∞' : '0.00';

        // Class Distribution (Squad)
        const squadClassCounts: Record<string, number> = {};
        // Class Distribution (Enemies)
        const enemyClassCounts: Record<string, number> = {};

        // Unique Composition Set: Tracks "AccountName-Profession"
        // If a player plays Guardian in 5 logs, they count ONCE as Guardian.
        // If they play Guardian in 3 and Necro in 2, they count ONCE as Guardian and ONCE as Necro.
        const uniqueSquadComposition = new Set<string>();

        validLogs.forEach(log => {
            const details = log.details;
            if (!details) return;
            const players = details.players as unknown as Player[];
            const targets = details.targets as unknown as Target[];

            // Squad Classes
            players.forEach(p => {
                if (!p.notInSquad) {
                    const prof = p.profession || 'Unknown';
                    const account = p.account || p.name; // Fallback if account missing
                    const key = `${account}-${prof}`;
                    uniqueSquadComposition.add(key);
                }
            });

            // Enemy Classes
            if (targets) {
                targets.forEach(t => {
                    if (!t.isFake) {
                        const rawName = t.name || 'Unknown';
                        // Clean up name: remove " pl-1234", " (Account)", ids, etc.
                        let cleanName = rawName
                            .replace(/\s+pl-\d+$/i, '')
                            .replace(/\s*\([^)]*\)/, '')
                            .trim();

                        enemyClassCounts[cleanName] = (enemyClassCounts[cleanName] || 0) + 1;
                    }
                });
            }
        });

        // Calculate Squad Counts from Unique Set
        uniqueSquadComposition.forEach(entry => {
            const [, prof] = entry.split('-');
            squadClassCounts[prof] = (squadClassCounts[prof] || 0) + 1;
        });

        // Format for Charts
        // Format for Charts - Explicit Sort
        const squadClassData = Object.entries(squadClassCounts)
            .map(([name, count]) => ({
                name,
                value: Number(count),
                color: getProfessionColor(name)
            }))
            .sort((a, b) => {
                const diff = b.value - a.value;
                if (diff !== 0) return diff;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 10);

        const enemyClassData = Object.entries(enemyClassCounts)
            .map(([name, count]) => ({
                name,
                value: Number(count),
                color: getProfessionColor(name)
            }))
            .sort((a, b) => {
                const diff = b.value - a.value;
                if (diff !== 0) return diff;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 10);

        // Map/Borderland Distribution
        const mapCounts: Record<string, number> = {};
        validLogs.forEach(log => {
            let mapName = 'Unknown';
            const details = log.details;
            if (details) {
                // Check explicit zone field if available (in some EI versions)
                if (details.zone) {
                    mapName = details.zone;
                } else if (details.fightName) {
                    const fn = details.fightName.toLowerCase();
                    if (fn.includes('eternal') || fn.includes(' eb')) mapName = 'Eternal Battlegrounds';
                    else if (fn.includes('blue') && (fn.includes('alpine') || fn.includes('borderlands'))) mapName = 'Blue Borderlands';
                    else if (fn.includes('green') && (fn.includes('alpine') || fn.includes('borderlands'))) mapName = 'Green Borderlands';
                    else if (fn.includes('red') || fn.includes('desert')) mapName = 'Red Borderlands';
                    else if (fn.includes('alpine')) mapName = 'Green Borderlands'; // Fallback for generic "Alpine" often implies home/green
                    else if (fn.includes('edge') || fn.includes('mists')) mapName = 'Edge of the Mists';
                    else if (fn.includes('armistice')) mapName = 'Armistice Bastion';
                    else if (fn.includes('obsidian')) mapName = 'Obsidian Sanctum';
                    else if (fn.includes('world vs world')) mapName = 'World vs World (Generic)';
                }
            }
            mapCounts[mapName] = (mapCounts[mapName] || 0) + 1;
        });

        // Map Colors
        const mapColors: Record<string, string> = {
            'Eternal Battlegrounds': '#ffffff', // White
            'Blue Borderlands': '#3b82f6', // Blue
            'Green Borderlands': '#10b981', // Emerald
            'Red Borderlands': '#ef4444', // Red
            'Edge of the Mists': '#a855f7', // Purple
            'Armistice Bastion': '#ec4899', // Pink
            'Obsidian Sanctum': '#f59e0b', // Amber
            'World vs World (Generic)': '#64748b', // Slate
            'Unknown': '#475569' // Slate-600
        };

        const mapData = Object.entries(mapCounts)
            .map(([name, value]) => ({ name, value, color: mapColors[name] || '#64748b' }))
            .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

        const timelineData = validLogs
            .filter(log => log.details)
            .map((log, index) => {
                const details = log.details;
                const players = (details?.players as unknown as Player[]) || [];
                const targets = details?.targets || [];
                const allies = players.filter(p => !p.notInSquad).length;
                const enemies = targets.filter((t: any) => !t.isFake).length;
                const timestamp = details?.uploadTime || log.uploadTime || 0;
                const label = timestamp
                    ? new Date(timestamp * 1000).toLocaleDateString()
                    : `Log ${index + 1}`;
                return {
                    label,
                    allies,
                    enemies,
                    timestamp
                };
            })
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .map((entry, index) => ({
                ...entry,
                index: index + 1
            }));

        return {
            total,
            wins,
            losses,
            avgSquadSize,
            avgEnemies,
            squadKDR,
            enemyKDR,
            totalSquadKills,
            totalSquadDeaths,
            totalEnemyKills,
            totalEnemyDeaths,
            maxDownContrib,
            maxCleanses,
            maxStrips,
            maxStab,
            maxHealing,
            maxBarrier,
            maxCC,
            closestToTag,
            topSkills,
            topIncomingSkills,

            mapData,
            squadClassData,
            enemyClassData,
            timelineData,

            maxDodges,
            mvp,
            silver,
            bronze,
            avgMvpScore,
            leaderboards
        };
    }, [logs]);

    const handleShare = async () => {
        setSharing(true);
        const node = document.getElementById('stats-dashboard-container');
        if (node) {
            try {
                // Wait a moment for UI to settle if anything changed
                await new Promise(r => setTimeout(r, 100));

                const scrollWidth = node.scrollWidth;
                const scrollHeight = node.scrollHeight;

                const dataUrl = await toPng(node, {
                    backgroundColor: '#0f172a',
                    quality: 0.95,
                    pixelRatio: 2,
                    cacheBust: true,
                    width: scrollWidth,
                    height: scrollHeight,
                    style: {
                        overflow: 'visible',
                        maxHeight: 'none',
                        height: 'auto'
                    }
                });

                const resp = await fetch(dataUrl);
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const buffer = new Uint8Array(arrayBuffer);

                window.electronAPI.sendStatsScreenshot(buffer);
            } catch (err) {
                console.error("Failed to capture stats:", err);
            }
        }
        setTimeout(() => setSharing(false), 2000);
    };

    const colorClasses: Record<string, { bg: string; text: string }> = {
        red: { bg: 'bg-red-500/20', text: 'text-red-400' },
        yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
        green: { bg: 'bg-green-500/20', text: 'text-green-400' },
        purple: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
        blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
        pink: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
        cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
        indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
    };

    const LeaderCard = ({ icon: Icon, title, data, color, unit = '', statKey }: any) => {
        const classes = colorClasses[color] || colorClasses.blue;
        const iconPath = getProfessionIconPath(data.profession || 'Unknown');
        const expanded = expandedLeader === statKey;
        const rows = stats.leaderboards?.[statKey] || [];
        const formatValue = (value: number) => {
            if (unit === 'dist') return Math.round(value).toLocaleString();
            return Math.round(value).toLocaleString();
        };
        return (
            <div
                className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 group hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => setExpandedLeader(expanded ? null : statKey)}
            >
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${classes.bg} ${classes.text} shrink-0`}>
                        <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-gray-400 text-xs font-bold uppercase tracking-wider truncate">{title}</div>
                        <div className="text-2xl font-bold text-white mt-0.5 break-words">
                            {Math.round(data.value).toLocaleString()} <span className="text-sm font-normal text-gray-500">{unit}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col border-t border-white/5 pt-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {iconPath && (
                            <img src={iconPath} alt={data.profession || 'Unknown'} className="w-4 h-4 shrink-0" />
                        )}
                        <div className="text-sm font-medium text-blue-300 truncate">{data.player || '-'}</div>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{data.count ? `${data.count} logs` : '-'}</div>
                </div>
                {expanded && (
                    <div className="border-t border-white/5 pt-3 space-y-2">
                        {rows.length === 0 ? (
                            <div className="text-xs text-gray-500 italic">No data available</div>
                        ) : (
                            <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                                {rows.map((row: any) => (
                                    <div key={`${statKey}-${row.rank}-${row.account}`} className="flex items-center gap-2 text-xs text-gray-300">
                                        <div className="w-6 text-right text-gray-500">{row.rank}</div>
                                        {getProfessionIconPath(row.profession) && (
                                            <img
                                                src={getProfessionIconPath(row.profession) as string}
                                                alt={row.profession}
                                                className="w-4 h-4 shrink-0"
                                            />
                                        )}
                                        <div className="flex-1 truncate">{row.account}</div>
                                        <div className="text-gray-400 font-mono">{formatValue(row.value)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const sortByCountDesc = (a: any, b: any) => {
        const diff = (b?.value || 0) - (a?.value || 0);
        if (diff !== 0) return diff;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
    };
    const sortedSquadClassData = [...stats.squadClassData].sort(sortByCountDesc);
    const sortedEnemyClassData = [...stats.enemyClassData].sort(sortByCountDesc);

    return (
        <div className="h-full flex flex-col p-1 w-full max-w-6xl mx-auto overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="space-y-0">
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Trophy className="w-6 h-6 text-yellow-500" />
                            Statistics Dashboard
                        </h1>
                        <p className="text-gray-400 text-xs">
                            Performance across {stats.total} uploaded logs
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleShare}
                    disabled={sharing}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    <Share2 className="w-4 h-4" />
                    {sharing ? 'Sharing...' : 'Share to Discord'}
                </button>
            </div>

            <div id="stats-dashboard-container" className="flex-1 overflow-y-auto pr-2 space-y-6 min-h-0 bg-[#0f172a] p-4 rounded-xl">

                {/* Wins/Losses Big Cards with embedded Averages and KDR */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-green-500/20 to-emerald-900/20 border border-green-500/30 rounded-2xl p-6 flex flex-col items-center justify-center relative">
                        <div className="text-5xl font-black text-green-400">{stats.wins}</div>
                        <div className="text-green-200/50 font-bold uppercase tracking-widest text-sm mt-2 mb-4">Victories</div>

                        <div className="grid grid-cols-2 gap-4 border-t border-green-500/20 pt-3 w-full">
                            <div className="flex flex-col items-center">
                                <div className="text-green-200 text-lg font-bold">{stats.avgSquadSize}</div>
                                <div className="text-green-200/40 text-[10px] uppercase font-bold tracking-wider">Avg Squad</div>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="text-green-200 text-lg font-bold">{stats.squadKDR}</div>
                                <div className="text-green-200/40 text-[10px] uppercase font-bold tracking-wider">Squad KDR</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-red-500/20 to-rose-900/20 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center justify-center relative">
                        <div className="text-5xl font-black text-red-400">{stats.losses}</div>
                        <div className="text-red-200/50 font-bold uppercase tracking-widest text-sm mt-2 mb-4">Defeats</div>

                        <div className="grid grid-cols-2 gap-4 border-t border-red-500/20 pt-3 w-full">
                            <div className="flex flex-col items-center">
                                <div className="text-red-200 text-lg font-bold">{stats.avgEnemies}</div>
                                <div className="text-red-200/40 text-[10px] uppercase font-bold tracking-wider">Avg Enemies</div>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="text-red-200 text-lg font-bold">{stats.enemyKDR}</div>
                                <div className="text-red-200/40 text-[10px] uppercase font-bold tracking-wider">Enemy KDR</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Records Grid */}
                <div>
                    <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                        Top Players (Total Accumulated Stats)
                    </h3>
                    <div className="mb-6">
                        <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/10 to-transparent border border-yellow-500/30 rounded-2xl p-6 relative overflow-hidden group">
                            {/* Glow Effect */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-yellow-500/20 transition-all" />

                            <div className="flex items-center gap-6 relative z-10">
                                <div className="hidden sm:flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/20 border border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                                    <Crown className="w-10 h-10 text-yellow-400" />
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                                        <span className="text-yellow-500 font-bold uppercase tracking-widest text-xs">Squad MVP</span>
                                    </div>
                                    <div className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                                        {stats.mvp.account}
                                        {getProfessionIconPath(stats.mvp.profession) && (
                                            <img
                                                src={getProfessionIconPath(stats.mvp.profession) as string}
                                                alt={stats.mvp.profession}
                                                className="w-6 h-6"
                                            />
                                        )}
                                        <span className="text-lg font-medium text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                            {stats.mvp.profession}
                                        </span>
                                    </div>
                                    <p className="text-gray-300 italic flex items-center gap-2 mb-3">
                                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500/50" />
                                        "{stats.mvp.reason}"
                                    </p>

                                    {/* Top Stats Breakdown */}
                                    <div className="flex flex-wrap gap-2">
                                        {stats.mvp.topStats && stats.mvp.topStats.map((stat: any, i: number) => {
                                            const rank = Math.max(1, Math.round(stat.ratio));
                                            const mod100 = rank % 100;
                                            const mod10 = rank % 10;
                                            const suffix = mod100 >= 11 && mod100 <= 13
                                                ? 'th'
                                                : mod10 === 1
                                                    ? 'st'
                                                    : mod10 === 2
                                                        ? 'nd'
                                                        : mod10 === 3
                                                            ? 'rd'
                                                            : 'th';
                                            return (
                                                <div key={i} className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-xs">
                                                    <span className="text-yellow-200 font-bold">{stat.name}</span>
                                                    <span className="text-white font-mono">{stat.val}</span>
                                                    <span className="text-yellow-500/50 text-[10px]">({rank}{suffix})</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="hidden lg:block text-right">
                                    <div className="text-yellow-500/40 font-mono text-sm uppercase tracking-wider font-bold">Contribution Score</div>
                                    <div className="text-4xl font-black text-yellow-500/80">{stats.mvp.score > 0 ? stats.mvp.score.toFixed(1) : '-'}</div>
                                    <div className="text-xs text-yellow-500/30 font-mono mt-1">Avg: {stats.avgMvpScore.toFixed(1)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {[
                            { label: 'Silver', data: stats.silver, color: 'from-slate-400/20 to-slate-700/10', accent: 'text-slate-200' },
                            { label: 'Bronze', data: stats.bronze, color: 'from-orange-500/25 to-amber-900/15', accent: 'text-orange-200' }
                        ].map((entry) => (
                            <div
                                key={entry.label}
                                className={`bg-gradient-to-r ${entry.color} border border-white/10 rounded-2xl p-4`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className={`text-xs uppercase tracking-widest font-semibold ${entry.accent}`}>
                                        {entry.label} MVP
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">
                                        {entry.data?.score ? entry.data.score.toFixed(1) : '-'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {entry.data && getProfessionIconPath(entry.data.profession) && (
                                        <img
                                            src={getProfessionIconPath(entry.data.profession) as string}
                                            alt={entry.data.profession}
                                            className="w-6 h-6"
                                        />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-lg font-semibold text-white truncate">
                                            {entry.data?.account || '—'}
                                        </div>
                                        <div className="text-xs text-gray-400 truncate">
                                            {entry.data?.profession || 'Unknown'}
                                        </div>
                                    </div>
                                    {entry.data?.topStats?.length ? (
                                        <div className="flex flex-col items-end gap-1 text-[10px] text-gray-300">
                                            {entry.data.topStats.map((stat: any, idx: number) => {
                                                const rank = Math.max(1, Math.round(stat.ratio));
                                                const mod100 = rank % 100;
                                                const mod10 = rank % 10;
                                                const suffix = mod100 >= 11 && mod100 <= 13
                                                    ? 'th'
                                                    : mod10 === 1
                                                        ? 'st'
                                                        : mod10 === 2
                                                            ? 'nd'
                                                            : mod10 === 3
                                                                ? 'rd'
                                                                : 'th';
                                                return (
                                                    <span key={idx} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                                                        {stat.name} {rank}{suffix}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <LeaderCard icon={HelpingHand} title="Down Contribution" data={stats.maxDownContrib} color="red" statKey="downContrib" />
                        <LeaderCard icon={Shield} title="Total Barrier" data={stats.maxBarrier} color="yellow" statKey="barrier" />
                        <LeaderCard icon={Activity} title="Total Healing" data={stats.maxHealing} color="green" statKey="healing" />
                        <LeaderCard icon={Wind} title="Total Dodges" data={stats.maxDodges} color="cyan" statKey="dodges" />
                        <LeaderCard icon={Zap} title="Total Strips" data={stats.maxStrips} color="purple" statKey="strips" />
                        <LeaderCard icon={Flame} title="Total Cleanses" data={stats.maxCleanses} color="blue" statKey="cleanses" />
                        <LeaderCard icon={Hammer} title="Total CC" data={stats.maxCC} color="pink" statKey="cc" />
                        <LeaderCard icon={ShieldCheck} title="Total Stab Gen" data={stats.maxStab} color="cyan" statKey="stability" />
                        <LeaderCard icon={Crosshair} title="Closest to Tag" data={stats.closestToTag} color="indigo" unit="dist" statKey="closestToTag" />
                    </div>
                </div>

                {/* Top Skills Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Outgoing Skills */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                            <Swords className="w-5 h-5 text-orange-400" />
                            Top Outgoing Damage Skills
                        </h3>
                        <div className="space-y-4">
                            {stats.topSkills.map((skill, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-white font-bold">{skill.name}</span>
                                            <div className="text-right">
                                                <span className="text-orange-400 font-mono font-bold">{Math.round(skill.damage).toLocaleString()}</span>
                                                <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                            </div>
                                        </div>
                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-orange-500 rounded-full"
                                                style={{ width: `${(skill.damage / (stats.topSkills[0]?.damage || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {stats.topSkills.length === 0 && (
                                <div className="text-center text-gray-500 italic py-4">No damage data available</div>
                            )}
                        </div>
                    </div>

                    {/* Incoming Skills */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-red-500" />
                            Top Incoming Damage Skills
                        </h3>
                        <div className="space-y-4">
                            {stats.topIncomingSkills.map((skill, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-white font-bold">{skill.name}</span>
                                            <div className="text-right">
                                                <span className="text-red-400 font-mono font-bold">{Math.round(skill.damage).toLocaleString()}</span>
                                                <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                            </div>
                                        </div>
                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-red-500 rounded-full"
                                                style={{ width: `${(skill.damage / (stats.topIncomingSkills[0]?.damage || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {stats.topIncomingSkills.length === 0 && (
                                <div className="text-center text-gray-500 italic py-4">No incoming damage data available</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Class Distribution Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 page-break-avoid">
                    {/* Squad Composition */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                            <Users className="w-5 h-5 text-green-400" />
                            Squad Composition
                        </h3>
                        <div className="grid grid-cols-[1fr_150px] h-[300px] gap-4">
                            <div className="h-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={sortedSquadClassData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {sortedSquadClassData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="w-full h-full overflow-y-auto pr-1 flex items-center">
                                <div className="space-y-1.5 text-[11px] mx-auto">
                                    {sortedSquadClassData.map((entry: any) => (
                                        <div key={entry.name} className="flex items-center gap-2 text-gray-300">
                                            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                                            {getProfessionIconPath(entry.name) ? (
                                                <img
                                                    src={getProfessionIconPath(entry.name) as string}
                                                    alt={entry.name}
                                                    className="w-4 h-4 shrink-0"
                                                />
                                            ) : (
                                                <span className="inline-block w-4 h-4 rounded-sm border border-white/10" />
                                            )}
                                            <span className="truncate">{entry.name}</span>
                                            <span className="text-gray-500">({entry.value})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Enemy Composition */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                            <Skull className="w-5 h-5 text-red-400" />
                            Enemy Composition (Top 10)
                        </h3>
                        <div className="grid grid-cols-[1fr_150px] h-[300px] gap-4">
                            <div className="h-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={sortedEnemyClassData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {sortedEnemyClassData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="w-full h-full overflow-y-auto pr-1 flex items-center">
                                <div className="space-y-1.5 text-[11px] mx-auto">
                                    {sortedEnemyClassData.map((entry: any) => (
                                        <div key={entry.name} className="flex items-center gap-2 text-gray-300">
                                            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                                            {getProfessionIconPath(entry.name) ? (
                                                <img
                                                    src={getProfessionIconPath(entry.name) as string}
                                                    alt={entry.name}
                                                    className="w-4 h-4 shrink-0"
                                                />
                                            ) : (
                                                <span className="inline-block w-4 h-4 rounded-sm border border-white/10" />
                                            )}
                                            <span className="truncate">{entry.name}</span>
                                            <span className="text-gray-500">({entry.value})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Squad vs Enemy Size Timeline */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid">
                    <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-green-400" />
                        Squad vs Enemy Size
                    </h3>
                    {stats.timelineData.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-10">No timeline data available</div>
                    ) : (
                        <div className="h-[260px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats.timelineData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="index"
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    />
                                    <YAxis
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                        width={36}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                        labelFormatter={(_value, payload) => {
                                            const point = payload?.[0]?.payload;
                                            return point?.label ? `Log ${point.index} • ${point.label}` : `Log ${_value}`;
                                        }}
                                        formatter={(value: any, name: string) => [
                                            value,
                                            name === 'allies' ? 'Allies' : 'Enemies'
                                        ]}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="allies"
                                        stroke="#22c55e"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#22c55e' }}
                                        activeDot={{ r: 5 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="enemies"
                                        stroke="#ef4444"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#ef4444' }}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Map Distribution Pie Chart */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid">
                    <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                        <MapIcon className="w-5 h-5 text-blue-400" />
                        Map Distribution
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.mapData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {stats.mapData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <ChartLegend
                                    verticalAlign="bottom"
                                    height={36}
                                    // @ts-ignore
                                    payload={stats.mapData.map(item => ({
                                        id: item.name,
                                        type: 'square',
                                        value: item.name,
                                        color: item.color,
                                        payload: item
                                    }))}
                                    formatter={(value: any, entry: any) => (
                                        <span className="text-gray-300 font-medium ml-1">
                                            {value} <span className="text-gray-500">({entry.payload.value})</span>
                                        </span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
