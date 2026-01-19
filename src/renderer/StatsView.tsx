import { useMemo, useState } from 'react';
import { ArrowLeft, Trophy, Share2, Swords, Shield, Zap, Activity, Flame, HelpingHand, Hammer, ShieldCheck, Crosshair } from 'lucide-react';
import { toPng } from 'html-to-image';
import { calculateAllStability, calculateSquadBarrier, calculateSquadHealing, calculateOutCC, calculateDownContribution } from '../shared/plenbot';
import { Player } from '../shared/dpsReportTypes';

interface StatsViewProps {
    logs: ILogData[];
    onBack: () => void;
}

export function StatsView({ logs, onBack }: StatsViewProps) {
    const [sharing, setSharing] = useState(false);

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
                        distCount: 0
                    });
                }

                const s = playerStats.get(key)!;
                s.logsJoined++;

                // Aggregate Metrics
                // Down Contribution
                s.downContrib += calculateDownContribution(p);

                // Support: Cleanses and Strips
                s.cleanses += p.support?.[0]?.condiCleanse || 0;
                s.strips += p.support?.[0]?.boonStrips || 0;

                // PlenBot calcs
                s.healing += calculateSquadHealing(p);
                s.barrier += calculateSquadBarrier(p);
                s.cc += calculateOutCC(p);
                s.stab += p.stabGeneration || 0;

                // Stack Distance (Distance to Tag)
                // statsAll[0] contains the stackDist field in Elite Insights JSON
                if (p.statsAll && p.statsAll.length > 0) {
                    const dist = p.statsAll[0].stackDist;
                    if (dist !== undefined && dist > 0) {
                        s.totalDist += dist;
                        s.distCount++;
                    }
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
        const emptyLeader = { value: 0, player: '-', count: 0 };

        let maxDownContrib = { ...emptyLeader };
        let maxCleanses = { ...emptyLeader };
        let maxStrips = { ...emptyLeader };
        let maxStab = { ...emptyLeader };
        let maxHealing = { ...emptyLeader };
        let maxBarrier = { ...emptyLeader };
        let maxCC = { ...emptyLeader };
        let closestToTag = { value: 999999, player: '-', count: 0 }; // Min is better

        playerStats.forEach(stat => {
            const pInfo = { player: stat.account, count: stat.logsJoined };

            if (stat.downContrib > maxDownContrib.value) maxDownContrib = { value: stat.downContrib, ...pInfo };
            if (stat.cleanses > maxCleanses.value) maxCleanses = { value: stat.cleanses, ...pInfo };
            if (stat.strips > maxStrips.value) maxStrips = { value: stat.strips, ...pInfo };
            if (stat.stab > maxStab.value) maxStab = { value: stat.stab, ...pInfo };
            if (stat.healing > maxHealing.value) maxHealing = { value: stat.healing, ...pInfo };
            if (stat.barrier > maxBarrier.value) maxBarrier = { value: stat.barrier, ...pInfo };
            if (stat.cc > maxCC.value) maxCC = { value: stat.cc, ...pInfo };

            if (stat.distCount > 0) {
                const avgDist = stat.totalDist / stat.distCount;
                if (avgDist > 0 && avgDist < closestToTag.value) {
                    closestToTag = { value: avgDist, ...pInfo };
                }
            }
        });

        if (closestToTag.value === 999999) closestToTag.value = 0;

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
            topIncomingSkills
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

    const LeaderCard = ({ icon: Icon, title, data, color, unit = '' }: any) => {
        const classes = colorClasses[color] || colorClasses.blue;
        return (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 group hover:bg-white/10 transition-colors">
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
                    <div className="text-sm font-medium text-blue-300 truncate">{data.player || '-'}</div>
                    <div className="text-xs text-gray-500 truncate">{data.count ? `${data.count} logs` : '-'}</div>
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col p-8 w-full max-w-6xl mx-auto overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <Trophy className="w-8 h-8 text-yellow-500" />
                            Statistics Dashboard
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <LeaderCard icon={HelpingHand} title="Down Contribution" data={stats.maxDownContrib} color="red" />
                        <LeaderCard icon={Shield} title="Total Barrier" data={stats.maxBarrier} color="yellow" />
                        <LeaderCard icon={Activity} title="Total Healing" data={stats.maxHealing} color="green" />
                        <LeaderCard icon={Zap} title="Total Strips" data={stats.maxStrips} color="purple" />
                        <LeaderCard icon={Flame} title="Total Cleanses" data={stats.maxCleanses} color="blue" />
                        <LeaderCard icon={Hammer} title="Total CC" data={stats.maxCC} color="pink" />
                        <LeaderCard icon={ShieldCheck} title="Total Stab Gen" data={stats.maxStab} color="cyan" />
                        <LeaderCard icon={Crosshair} title="Closest to Tag" data={stats.closestToTag} color="indigo" unit="dist" />
                    </div>
                </div>

                {/* Top Skills Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            </div>
        </div>
    );
}
