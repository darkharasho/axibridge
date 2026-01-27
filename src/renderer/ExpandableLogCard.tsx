import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { calculateAllStability, calculateDownContribution, calculateIncomingStats, calculateOutCC, calculateSquadBarrier, calculateSquadHealing } from '../shared/plenbot';
import { Player } from '../shared/dpsReportTypes';
import { DEFAULT_EMBED_STATS, IEmbedStatSettings } from './global.d';
import { getProfessionAbbrev, getProfessionEmoji, getProfessionIconPath } from '../shared/professionUtils';

interface ExpandableLogCardProps {
    log: any;
    isExpanded: boolean;
    onToggle: () => void;
    onCancel?: () => void;
    screenshotMode?: boolean;
    embedStatSettings?: IEmbedStatSettings;
    useClassIcons?: boolean;
    screenshotSection?: {
        type: 'summary' | 'toplists' | 'tile';
        start?: number;
        count?: number;
        showHeader?: boolean;
        tileKind?: 'summary' | 'incoming' | 'toplist';
        tileId?: 'squad' | 'enemy' | 'incoming-attacks' | 'incoming-cc' | 'incoming-strips' | 'incoming-blank';
        tileIndex?: number;
    };
}

export function ExpandableLogCard({ log, isExpanded, onToggle, onCancel, screenshotMode, embedStatSettings, screenshotSection, useClassIcons }: ExpandableLogCardProps) {
    const details = log.details || {};
    const players: Player[] = details.players || [];
    const targets = details.targets || [];
    const settings = embedStatSettings || DEFAULT_EMBED_STATS;
    calculateAllStability(players, { durationMS: details.durationMS, buffMap: details.buffMap });
    const squadPlayers = players.filter((p: any) => !p.notInSquad);
    const nonSquadPlayers = players.filter((p: any) => p.notInSquad);

    const isQueued = log.status === 'queued';
    const isPending = log.status === 'pending';
    const isUploading = log.status === 'uploading';
    const hasError = log.status === 'error';
    const isDiscord = log.status === 'discord';
    const statusLabel = isQueued ? 'Queued'
        : isPending ? 'Pending'
        : isUploading ? 'Parsing with dps.report'
            : isDiscord ? 'Preparing Discord preview'
                : null;

    // --- Stats Calculation ---
    let totalDps = 0;
    let totalDmg = 0;
    let totalDowns = 0;
    let totalDeaths = 0;
    let totalDmgTaken = 0;

    let totalMiss = 0;
    let totalBlock = 0;
    let totalEvade = 0;
    let totalDodge = 0;

    let squadDps = 0;
    let squadDmg = 0;
    let squadDowns = 0;
    let squadDeaths = 0;
    let squadCC = 0;
    let squadResurrects = 0;

    let totalCCTaken = 0;
    let totalCCMissed = 0;
    let totalCCBlocked = 0;

    let totalStripsTaken = 0;
    let totalStripsMissed = 0;
    let totalStripsBlocked = 0;

    players.forEach((p: any) => {
        const isSquad = !p.notInSquad;
        if (p.dpsAll && p.dpsAll.length > 0) {
            totalDps += p.dpsAll[0].dps;
            totalDmg += p.dpsAll[0].damage;
            if (isSquad) {
                squadDps += p.dpsAll[0].dps;
                squadDmg += p.dpsAll[0].damage;
                squadCC += calculateOutCC(p); // Use accurate PlenBot calculation
                squadResurrects += (p.support?.[0]?.resurrects || 0);
            }
        }
        if (p.defenses && p.defenses.length > 0) {
            const d = p.defenses[0];
            totalDowns += d.downCount;
            totalDeaths += d.deadCount;
            totalDmgTaken += d.damageTaken || 0;
            if (isSquad) {
                squadDowns += d.downCount;
                squadDeaths += d.deadCount;
            }
            totalMiss += d.missedCount || 0;
            totalBlock += d.blockedCount || 0;
            totalEvade += d.evadedCount || 0;
            totalDodge += d.dodgeCount || 0;
            // totalCCTaken += d.interruptedCount || 0; <-- Handled by PlenBot logic now
            // totalStripsTaken += d.boonStrips || 0;
        }

        const pStats = calculateIncomingStats(p);
        totalCCTaken += pStats.cc.total;
        totalCCMissed += pStats.cc.missed;
        totalCCBlocked += pStats.cc.blocked;

        totalStripsTaken += pStats.strips.total;
        totalStripsMissed += pStats.strips.missed;
        totalStripsBlocked += pStats.strips.blocked;
    });

    // Calculate Enemy (Target) Stats - how many times WE downed/killed them
    // We aggregate from player statsTargets, which records what each player did to targets
    let enemyDowns = 0;
    let enemyDeaths = 0;
    let enemyCount = 0;

    // Count non-fake targets
    targets.forEach((t: any) => {
        if (!t.isFake) enemyCount++;
    });

    // Aggregate downed/killed from statsTargets
    players.forEach((p: any) => {
        if (p.notInSquad) return; // Only count squad contributions
        if (p.statsTargets && p.statsTargets.length > 0) {
            // statsTargets[targetIndex] contains stats for that target
            p.statsTargets.forEach((targetStats: any) => {
                if (targetStats && targetStats.length > 0) {
                    const st = targetStats[0]; // Phase 0
                    enemyDowns += st.downed || 0;
                    enemyDeaths += st.killed || 0;
                }
            });
        }
    });

    // Calculate enemy DPS (damage they dealt to us per second)
    const durationSec = (details.durationMS || 0) / 1000 || 1;
    const enemyDps = Math.round(totalDmgTaken / durationSec);

    const getTargetStatTotal = (p: any, key: 'killed' | 'downed') => {
        if (!p.statsTargets) return 0;
        return p.statsTargets.reduce((sum: number, targetStats: any) => {
            if (!targetStats || targetStats.length === 0) return sum;
            const st = targetStats[0];
            return sum + (st?.[key] || 0);
        }, 0);
    };

    const getDistanceToTag = (p: any) => {
        const stats = p.statsAll?.[0];
        const distToCom = stats?.distToCom;
        if (distToCom !== undefined && distToCom !== null) {
            return distToCom;
        }
        const stackDist = stats?.stackDist;
        return stackDist || 0;
    };
    const getResurrects = (p: any) => p.support?.[0]?.resurrects || 0;
    const getBreakbarDamage = (p: any) => p.dpsAll?.[0]?.breakbarDamage || 0;
    const getDamageTaken = (p: any) => p.defenses?.[0]?.damageTaken || 0;
    const getDeaths = (p: any) => p.defenses?.[0]?.deadCount || 0;
    const getDodges = (p: any) => p.defenses?.[0]?.dodgeCount || 0;

    const clampTopRows = (value: number) => Math.min(10, Math.max(1, Math.floor(value)));
    const maxTopRows = clampTopRows(settings.maxTopListRows ?? 5);
    const classDisplay = settings.classDisplay ?? 'off';
    const showClassIcons = classDisplay === 'emoji' && useClassIcons;
    const getClassToken = (p: any) => {
        if (classDisplay === 'short') {
            return getProfessionAbbrev(p.profession || 'Unknown');
        }
        if (classDisplay === 'emoji') {
            return getProfessionEmoji(p.profession || 'Unknown');
        }
        return '';
    };

    // Helper for rendering top lists
    const TopList = ({ title, sortFn, valFn, fmtVal, fullHeight }: { title: string, sortFn: (a: any, b: any) => number, valFn: (p: any) => any, fmtVal: (v: any) => string, fullHeight?: boolean }) => {
        const top = [...squadPlayers].sort(sortFn).slice(0, maxTopRows);
        const hasData = top.some(p => {
            const val = valFn(p);
            return val > 0 || (typeof val === 'string' && val !== '0');
        });

        return (
            <div className={`bg-white/5 rounded-lg p-3 border border-white/5 shadow-inner ${fullHeight ? 'h-full' : ''}`}>
                <h5 className={`font-semibold text-gray-200 mb-2 border-b border-white/10 pb-1 uppercase tracking-tighter ${fullHeight ? 'text-sm' : 'text-[11px]'}`}>{title}</h5>
                {hasData ? (
                    <div className={`font-mono space-y-1 text-gray-300 ${fullHeight ? 'text-base' : 'text-[10px]'}`}>
                        {top.map((p, i) => {
                            const val = valFn(p);
                            if (val <= 0 && (typeof val !== 'string' || val === '0')) return null;
                            return (
                                <div key={`${p.account}-${i}`} className="flex justify-between gap-2 border-b border-white/5 last:border-0 pb-0.5">
                                    <span className="flex-1 min-w-0 flex items-center gap-2">
                                        <span className="text-gray-500 w-5 shrink-0 text-right">{i + 1}</span>
                                        {getClassToken(p) && (
                                            <span className="text-gray-400 w-10 shrink-0 text-center text-[10px] leading-none">
                                                {showClassIcons ? (
                                                    getProfessionIconPath(p.profession || 'Unknown') ? (
                                                        <img
                                                            src={getProfessionIconPath(p.profession || 'Unknown') as string}
                                                            alt={p.profession || 'Unknown'}
                                                            className="w-4 h-4 inline-block"
                                                        />
                                                    ) : (
                                                        getClassToken(p)
                                                    )
                                                ) : (
                                                    classDisplay === 'emoji' ? getClassToken(p) : `[${getClassToken(p)}]`
                                                )}
                                            </span>
                                        )}
                                        <span className="truncate">
                                            {p.name || p.character_name || p.account}
                                        </span>
                                    </span>
                                    <span className="text-right shrink-0 font-bold text-blue-400">{fmtVal(val)}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-[10px] text-gray-500 italic text-center py-2">No Data</div>
                )}
            </div>
        );
    };

    const topListItems = [
        {
            enabled: settings.showDamage,
            title: "Damage",
            sortFn: (a: any, b: any) => (b.dpsAll?.[0]?.damage || 0) - (a.dpsAll?.[0]?.damage || 0),
            valFn: (p: any) => p.dpsAll?.[0]?.damage || 0,
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showDownContribution,
            title: "Down Contribution",
            sortFn: (a: any, b: any) => calculateDownContribution(b) - calculateDownContribution(a),
            valFn: (p: any) => calculateDownContribution(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showHealing,
            title: "Healing",
            sortFn: (a: any, b: any) => calculateSquadHealing(b) - calculateSquadHealing(a),
            valFn: (p: any) => calculateSquadHealing(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showBarrier,
            title: "Barrier",
            sortFn: (a: any, b: any) => calculateSquadBarrier(b) - calculateSquadBarrier(a),
            valFn: (p: any) => calculateSquadBarrier(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showCleanses,
            title: "Cleanses",
            sortFn: (a: any, b: any) => ((b.support?.[0]?.condiCleanse || 0) + (b.support?.[0]?.condiCleanseSelf || 0)) - ((a.support?.[0]?.condiCleanse || 0) + (a.support?.[0]?.condiCleanseSelf || 0)),
            valFn: (p: any) => (p.support?.[0]?.condiCleanse || 0) + (p.support?.[0]?.condiCleanseSelf || 0),
            fmtVal: (v: number) => v.toString()
        },
        {
            enabled: settings.showBoonStrips,
            title: "Strips",
            sortFn: (a: any, b: any) => (b.support?.[0]?.boonStrips || 0) - (a.support?.[0]?.boonStrips || 0),
            valFn: (p: any) => p.support?.[0]?.boonStrips || 0,
            fmtVal: (v: number) => v.toString()
        },
        {
            enabled: settings.showCC,
            title: "CC",
            sortFn: (a: any, b: any) => calculateOutCC(b) - calculateOutCC(a),
            valFn: (p: any) => calculateOutCC(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showStability,
            title: "Stability",
            sortFn: (a: any, b: any) => (b.stabGeneration || 0) - (a.stabGeneration || 0),
            valFn: (p: any) => p.stabGeneration || 0,
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showResurrects,
            title: "Resurrects",
            sortFn: (a: any, b: any) => getResurrects(b) - getResurrects(a),
            valFn: (p: any) => getResurrects(p),
            fmtVal: (v: number) => v.toString()
        },
        {
            enabled: settings.showDistanceToTag,
            title: "Distance to Tag",
            sortFn: (a: any, b: any) => getDistanceToTag(a) - getDistanceToTag(b),
            valFn: (p: any) => getDistanceToTag(p),
            fmtVal: (v: number) => v.toFixed(1)
        },
        {
            enabled: settings.showKills,
            title: "Kills",
            sortFn: (a: any, b: any) => getTargetStatTotal(b, 'killed') - getTargetStatTotal(a, 'killed'),
            valFn: (p: any) => getTargetStatTotal(p, 'killed'),
            fmtVal: (v: number) => v.toString()
        },
        {
            enabled: settings.showDowns,
            title: "Downs",
            sortFn: (a: any, b: any) => getTargetStatTotal(b, 'downed') - getTargetStatTotal(a, 'downed'),
            valFn: (p: any) => getTargetStatTotal(p, 'downed'),
            fmtVal: (v: number) => v.toString()
        },
        {
            enabled: settings.showBreakbarDamage,
            title: "Breakbar Damage",
            sortFn: (a: any, b: any) => getBreakbarDamage(b) - getBreakbarDamage(a),
            valFn: (p: any) => getBreakbarDamage(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showDamageTaken,
            title: "Damage Taken",
            sortFn: (a: any, b: any) => getDamageTaken(b) - getDamageTaken(a),
            valFn: (p: any) => getDamageTaken(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showDeaths,
            title: "Deaths",
            sortFn: (a: any, b: any) => getDeaths(b) - getDeaths(a),
            valFn: (p: any) => getDeaths(p),
            fmtVal: (v: number) => v.toString()
        },
        {
            enabled: settings.showDodges,
            title: "Dodges",
            sortFn: (a: any, b: any) => getDodges(b) - getDodges(a),
            valFn: (p: any) => getDodges(p),
            fmtVal: (v: number) => v.toString()
        }
    ];

    const visibleTopLists = topListItems.filter(item => item.enabled);
    const showSummarySection = settings.showSquadSummary || settings.showEnemySummary;
    const showIncomingSection = settings.showIncomingStats;
    const showHeader = screenshotSection?.showHeader ?? true;
    const topListSliceStart = screenshotSection?.start || 0;
    const topListSliceCount = screenshotSection?.count || visibleTopLists.length;
    const topListSlice = visibleTopLists.slice(topListSliceStart, topListSliceStart + topListSliceCount);
    const tileTopList = screenshotSection?.tileKind === 'toplist' && screenshotSection.tileIndex !== undefined
        ? visibleTopLists[screenshotSection.tileIndex]
        : undefined;

    const renderSquadSummary = (compact?: boolean, fullHeight?: boolean) => (
        <div className={`bg-white/5 rounded-xl ${compact ? 'p-3' : 'p-4'} border border-white/10 shadow-lg ${fullHeight ? 'h-full' : ''}`}>
            <h5 className={`font-black text-green-400 mb-3 uppercase tracking-widest ${fullHeight ? 'text-base' : 'text-xs'} border-b border-green-400/20 pb-2`}>Squad Summary</h5>
            <div className={`font-mono text-gray-200 space-y-2 text-left ${fullHeight ? 'text-lg' : 'text-sm'}`}>
                <div className="flex justify-between"><span>Count:</span> <span className="text-white font-bold">{squadPlayers.length} {nonSquadPlayers.length > 0 ? `(+${nonSquadPlayers.length})` : ''}</span></div>
                <div className="flex justify-between"><span>DMG:</span> <span className="text-white font-bold">{squadDmg.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>DPS:</span> <span className="text-white font-bold">{Math.round(squadDps).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Downs:</span> <span className="text-white font-bold">{squadDowns}</span></div>
                <div className="flex justify-between"><span>Deaths:</span> <span className="text-white font-bold">{squadDeaths}</span></div>
            </div>
        </div>
    );

    const renderEnemySummary = (compact?: boolean, fullHeight?: boolean) => (
        <div className={`bg-white/5 rounded-xl ${compact ? 'p-3' : 'p-4'} border border-white/10 shadow-lg ${fullHeight ? 'h-full' : ''}`}>
            <h5 className={`font-black text-red-400 mb-3 uppercase tracking-widest ${fullHeight ? 'text-base' : 'text-xs'} border-b border-red-400/20 pb-2`}>Enemy Summary</h5>
            <div className={`font-mono text-gray-200 space-y-2 text-left ${fullHeight ? 'text-lg' : 'text-sm'}`}>
                <div className="flex justify-between"><span>Count:</span> <span className="text-white font-bold">{enemyCount}</span></div>
                <div className="flex justify-between"><span>DMG:</span> <span className="text-white font-bold">{totalDmgTaken.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>DPS:</span> <span className="text-white font-bold">{enemyDps.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Downs:</span> <span className="text-white font-bold">{enemyDowns}</span></div>
                <div className="flex justify-between"><span>Kills:</span> <span className="text-white font-bold">{enemyDeaths}</span></div>
            </div>
        </div>
    );

    const renderIncoming = (type: 'attacks' | 'cc' | 'strips', fullHeight?: boolean) => {
        const label = type === 'attacks' ? 'Incoming Attack' : type === 'cc' ? 'Incoming CC' : 'Incoming Strips';
        const miss = type === 'attacks' ? totalMiss : type === 'cc' ? totalCCMissed : totalStripsMissed;
        const block = type === 'attacks' ? totalBlock : type === 'cc' ? totalCCBlocked : totalStripsBlocked;
        const total = type === 'attacks' ? totalMiss + totalBlock + totalEvade + totalDodge : type === 'cc' ? totalCCTaken : totalStripsTaken;
        const color = type === 'attacks' ? 'text-blue-400' : type === 'cc' ? 'text-purple-400' : 'text-orange-400';
        return (
            <div className={`bg-white/5 rounded-xl p-4 border border-white/10 ${fullHeight ? 'h-full' : ''}`}>
                <h5 className={`font-bold ${color} mb-2 uppercase tracking-tight ${fullHeight ? 'text-[8px]' : 'text-[10px]'}`}>{label}</h5>
                <div className={`font-mono text-gray-300 text-left space-y-1 ${fullHeight ? 'text-[9px]' : 'text-xs'}`}>
                    <div className="flex justify-between text-gray-500"><span>Miss:</span> <span>{miss}</span></div>
                    <div className="flex justify-between text-gray-500"><span>Block:</span> <span>{block}</span></div>
                    <div className="flex justify-between text-white font-bold pt-1 border-t border-white/5"><span>Total:</span> <span>{total}</span></div>
                </div>
            </div>
        );
    };

    if (screenshotMode) {
        if (screenshotSection?.type === 'tile') {
            if (screenshotSection.tileKind === 'toplist' && !tileTopList) {
                return null;
            }
            const tileContent = (() => {
                if (screenshotSection.tileKind === 'summary') {
                    if (screenshotSection.tileId === 'squad') return renderSquadSummary(true, true);
                    if (screenshotSection.tileId === 'enemy') return renderEnemySummary(true, true);
                }
                if (screenshotSection.tileKind === 'incoming') {
                    if (screenshotSection.tileId === 'incoming-attacks') return renderIncoming('attacks', true);
                    if (screenshotSection.tileId === 'incoming-cc') return renderIncoming('cc', true);
                    if (screenshotSection.tileId === 'incoming-strips') return renderIncoming('strips', true);
                    if (screenshotSection.tileId === 'incoming-blank') {
                        return (
                            <img
                                src="/img/Transparent.png"
                                alt=""
                                className="w-full h-full object-contain"
                            />
                        );
                    }
                }
                if (screenshotSection.tileKind === 'toplist' && tileTopList) {
                    return (
                        <TopList
                            title={tileTopList.title}
                            sortFn={tileTopList.sortFn}
                            valFn={tileTopList.valFn}
                            fmtVal={tileTopList.fmtVal}
                            fullHeight={true}
                        />
                    );
                }
                return null;
            })();
            if (!tileContent) return null;
            const tileSizeClass = screenshotSection.tileKind === 'incoming'
                ? 'w-[180px] h-[140px]'
                : 'w-[360px] h-[360px]';
            return (
                <div
                    data-screenshot-id={log.id || log.filePath}
                    data-screenshot-group={screenshotSection.tileKind === 'incoming' ? 'incoming' : 'default'}
                    data-screenshot-transparent={screenshotSection.tileId === 'incoming-blank' ? 'true' : undefined}
                    className={`bg-transparent ${tileSizeClass} p-0 m-0`}
                >
                    <div className="w-full h-full">
                        {tileContent}
                    </div>
                </div>
            );
        }
        if (screenshotSection?.type === 'summary' && !showSummarySection && !showIncomingSection) {
            return null;
        }
        if (screenshotSection?.type === 'toplists' && topListSlice.length === 0) {
            return null;
        }
        return (
            <div
                id={!screenshotSection ? `log-screenshot-${log.id || log.filePath}` : undefined}
                data-screenshot-id={screenshotSection ? (log.id || log.filePath) : undefined}
                className="bg-slate-900 border border-white/20 rounded-2xl overflow-hidden w-[1200px] shadow-2xl p-0 m-0"
            >
                {showHeader && (
                    <div className="p-6 flex items-center gap-6 bg-white/5 border-b border-white/10">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center border-2 ${hasError ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-green-500/20 border-green-500/30 text-green-400'}`}>
                            <span className="font-bold text-lg uppercase">{hasError ? 'ERR' : 'LOG'}</span>
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <div className="flex justify-between items-start">
                                <h4 className="text-2xl font-black text-white truncate leading-tight">{details.fightName || log.fightName || log.filePath.split(/[\\\/]/).pop()}</h4>
                                <span className="text-lg text-blue-400 font-mono font-bold">{details.encounterDuration || log.encounterDuration || '--:--'}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm font-medium text-gray-400">
                                <span className="bg-white/5 px-2 py-0.5 rounded-md border border-white/10">{players.length} Players {nonSquadPlayers.length > 0 ? `(${squadPlayers.length} Squad + ${nonSquadPlayers.length} Others)` : ''}</span>
                                <span className="text-gray-600">•</span>
                                <span>{(log.uploadTime || details.uploadTime) ? new Date((log.uploadTime || details.uploadTime) * 1000).toLocaleTimeString() : 'Just now'}</span>
                            </div>
                        </div>
                    </div>
                )}
                <div className="p-6 space-y-6 bg-black/40">
                    {(screenshotSection?.type !== 'toplists' && showSummarySection) && (
                        <div className="grid grid-cols-2 gap-4 text-base">
                            {settings.showSquadSummary && (
                                <div className="bg-white/5 rounded-xl p-4 border border-white/10 shadow-lg">
                                    <h5 className="font-black text-green-400 mb-3 uppercase tracking-widest text-xs border-b border-green-400/20 pb-2">Squad Summary</h5>
                                    <div className="font-mono text-gray-200 space-y-2 text-left text-sm">
                                        <div className="flex justify-between"><span>Count:</span> <span className="text-white font-bold">{squadPlayers.length} {nonSquadPlayers.length > 0 ? `(+${nonSquadPlayers.length})` : ''}</span></div>
                                        <div className="flex justify-between"><span>DMG:</span> <span className="text-white font-bold">{squadDmg.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>DPS:</span> <span className="text-white font-bold">{Math.round(squadDps).toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>Downs:</span> <span className="text-white font-bold">{squadDowns}</span></div>
                                        <div className="flex justify-between"><span>Deaths:</span> <span className="text-white font-bold">{squadDeaths}</span></div>
                                    </div>
                                </div>
                            )}
                            {settings.showEnemySummary && (
                                <div className="bg-white/5 rounded-xl p-4 border border-white/10 shadow-lg">
                                    <h5 className="font-black text-red-400 mb-3 uppercase tracking-widest text-xs border-b border-red-400/20 pb-2">Enemy Summary</h5>
                                    <div className="font-mono text-gray-200 space-y-2 text-left text-sm">
                                        <div className="flex justify-between"><span>Count:</span> <span className="text-white font-bold">{enemyCount}</span></div>
                                        <div className="flex justify-between"><span>DMG:</span> <span className="text-white font-bold">{totalDmgTaken.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>DPS:</span> <span className="text-white font-bold">{enemyDps.toLocaleString()}</span></div>
                                        <div className="flex justify-between"><span>Downs:</span> <span className="text-white font-bold">{enemyDowns}</span></div>
                                        <div className="flex justify-between"><span>Kills:</span> <span className="text-white font-bold">{enemyDeaths}</span></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {(screenshotSection?.type !== 'toplists' && showIncomingSection) && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h5 className="font-bold text-blue-400 mb-2 uppercase tracking-tight text-[10px]">Incoming Attack</h5>
                                <div className="font-mono text-xs text-gray-300 text-left space-y-1">
                                    <div className="flex justify-between text-gray-500"><span>Miss:</span> <span className="text-blue-200">{totalMiss}</span></div>
                                    <div className="flex justify-between text-gray-500"><span>Block:</span> <span className="text-blue-200">{totalBlock}</span></div>
                                    <div className="flex justify-between text-white font-bold pt-1 border-t border-white/5"><span>Total:</span> <span>{totalMiss + totalBlock + totalEvade + totalDodge}</span></div>
                                </div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h5 className="font-bold text-purple-400 mb-2 uppercase tracking-tight text-[10px]">Incoming CC</h5>
                                <div className="font-mono text-xs text-gray-300 text-left space-y-1">
                                    <div className="flex justify-between text-gray-500"><span>Miss:</span> <span className="text-purple-200">{totalCCMissed}</span></div>
                                    <div className="flex justify-between text-gray-500"><span>Block:</span> <span className="text-purple-200">{totalCCBlocked}</span></div>
                                    <div className="flex justify-between text-white font-bold pt-1 border-t border-white/5"><span>Total:</span> <span>{totalCCTaken}</span></div>
                                </div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h5 className="font-bold text-orange-400 mb-2 uppercase tracking-tight text-[10px]">Incoming Strips</h5>
                                <div className="font-mono text-xs text-gray-300 text-left space-y-1">
                                    <div className="flex justify-between text-gray-500"><span>Miss:</span> <span className="text-orange-200">{totalStripsMissed}</span></div>
                                    <div className="flex justify-between text-gray-500"><span>Block:</span> <span className="text-orange-200">{totalStripsBlocked}</span></div>
                                    <div className="flex justify-between text-white font-bold pt-1 border-t border-white/5"><span>Total:</span> <span>{totalStripsTaken}</span></div>
                                </div>
                            </div>
                        </div>
                    )}
                    {(screenshotSection?.type !== 'summary' && topListSlice.length > 0) && (
                        <div className="grid grid-cols-2 gap-4">
                            {topListSlice.map(item => (
                                <TopList
                                    key={item.title}
                                    title={item.title}
                                    sortFn={item.sortFn}
                                    valFn={item.valFn}
                                    fmtVal={item.fmtVal}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            layout
            className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all mb-3 group shadow-xl"
        >
            {/* Collapsed View */}
            <div className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all shrink-0 ${isQueued ? 'bg-slate-500/20 border-slate-400/30 text-slate-300 animate-pulse' :
                    isPending ? 'bg-slate-500/20 border-slate-400/30 text-slate-300 animate-pulse' :
                        isUploading ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 animate-pulse' :
                            isDiscord ? 'bg-purple-500/20 border-purple-500/30 text-purple-400 animate-pulse' :
                                hasError ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                                    'bg-green-500/20 border-green-500/30 text-green-400'
                    }`}>
                    <span className="font-bold text-xs uppercase">
                        {isQueued ? 'QUE' : isPending ? 'PEN' : isUploading ? '...' : isDiscord ? 'DC' : hasError ? 'ERR' : 'LOG'}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className="text-sm font-bold text-gray-200 truncate">{details.fightName || log.fightName || log.filePath.split(/[\\\/]/).pop()}</h4>
                        <span className="text-xs text-gray-500 font-mono">{details.encounterDuration || log.encounterDuration || '--:--'}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{statusLabel ? statusLabel : `${players.length || '0'} Players${nonSquadPlayers.length > 0 ? ` (${squadPlayers.length} +${nonSquadPlayers.length})` : ''}`}</span>
                        <span>•</span>
                        <span>{(log.uploadTime || details.uploadTime)
                            ? new Date((log.uploadTime || details.uploadTime) * 1000).toLocaleTimeString()
                            : (statusLabel ? statusLabel : 'Just now')}</span>
                    </div>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!log.details && !isExpanded && onCancel) {
                            onCancel();
                            return;
                        }
                        onToggle();
                    }}
                    disabled={!log.details && !isExpanded && !onCancel}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${!log.details
                        ? onCancel ? 'bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20' : 'bg-white/5 text-gray-600 border-white/5 cursor-not-allowed opacity-50'
                        : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white group-hover:border-white/20'
                        }`}
                >
                    {!log.details && !isExpanded ? (
                        <><span>Cancel</span></>
                    ) : isExpanded ? (
                        <><ChevronUp className="w-3 h-3" /><span>Hide</span></>
                    ) : (
                        <><ChevronDown className="w-3 h-3" /><span>Details</span></>
                    )}
                </button>
            </div>

            {/* Expanded View */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/10 bg-black/40 shadow-inner"
                    >
                        <div className="p-4 space-y-4">
                            {(settings.showSquadSummary || settings.showEnemySummary) && (
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    {settings.showSquadSummary && (
                                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                                            <h5 className="font-semibold text-green-400 mb-2 uppercase tracking-wider text-[10px]">Squad Summary</h5>
                                            <div className="font-mono text-gray-300 space-y-1">
                                                <div className="flex justify-between"><span>Count:</span> <span>{squadPlayers.length} {nonSquadPlayers.length > 0 ? `(+${nonSquadPlayers.length})` : ''}</span></div>
                                                <div className="flex justify-between"><span>DMG:</span> <span>{squadDmg.toLocaleString()}</span></div>
                                                <div className="flex justify-between"><span>DPS:</span> <span>{Math.round(squadDps).toLocaleString()}</span></div>
                                                <div className="flex justify-between"><span>Downs:</span> <span>{squadDowns}</span></div>
                                                <div className="flex justify-between"><span>Deaths:</span> <span>{squadDeaths}</span></div>
                                            </div>
                                        </div>
                                    )}
                                    {settings.showEnemySummary && (
                                        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                                            <h5 className="font-semibold text-red-400 mb-2 uppercase tracking-wider text-[10px]">Enemy Summary</h5>
                                            <div className="font-mono text-gray-300 space-y-1">
                                                <div className="flex justify-between"><span>Count:</span> <span>{enemyCount}</span></div>
                                                <div className="flex justify-between"><span>DMG:</span> <span>{totalDmgTaken.toLocaleString()}</span></div>
                                                <div className="flex justify-between"><span>DPS:</span> <span>{enemyDps.toLocaleString()}</span></div>
                                                <div className="flex justify-between"><span>Downs:</span> <span>{enemyDowns}</span></div>
                                                <div className="flex justify-between"><span>Kills:</span> <span>{enemyDeaths}</span></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {settings.showIncomingStats && (
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                                        <h5 className="font-semibold text-blue-400 mb-1 uppercase tracking-wider text-[9px]">Incoming Attack</h5>
                                        <div className="font-mono text-[10px] text-gray-300">
                                            <div className="flex justify-between text-gray-500"><span>Miss:</span> <span className="text-gray-300">{totalMiss}</span></div>
                                            <div className="flex justify-between text-gray-500"><span>Block:</span> <span className="text-gray-300">{totalBlock}</span></div>
                                            <div className="flex justify-between text-gray-500"><span>Total:</span> <span className="text-gray-300">{totalMiss + totalBlock + totalEvade + totalDodge}</span></div>
                                        </div>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                                        <h5 className="font-semibold text-purple-400 mb-1 uppercase tracking-wider text-[9px]">Incoming CC</h5>
                                        <div className="font-mono text-[10px] text-gray-300">
                                            <div className="flex justify-between text-gray-500"><span>Miss:</span> <span className="text-gray-300">{totalCCMissed}</span></div>
                                            <div className="flex justify-between text-gray-500"><span>Block:</span> <span className="text-gray-300">{totalCCBlocked}</span></div>
                                            <div className="flex justify-between text-gray-500"><span>Total:</span> <span className="text-gray-300">{totalCCTaken}</span></div>
                                        </div>
                                    </div>

                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                                        <h5 className="font-semibold text-orange-400 mb-1 uppercase tracking-wider text-[9px]">Incoming Strips</h5>
                                        <div className="font-mono text-[10px] text-gray-300">
                                            <div className="flex justify-between text-gray-500"><span>Miss:</span> <span className="text-gray-300">{totalStripsMissed}</span></div>
                                            <div className="flex justify-between text-gray-500"><span>Block:</span> <span className="text-gray-300">{totalStripsBlocked}</span></div>
                                            <div className="flex justify-between text-gray-500"><span>Total:</span> <span className="text-gray-300">{totalStripsTaken}</span></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {visibleTopLists.length > 0 && (
                                <div className="grid grid-cols-2 gap-3">
                                    {visibleTopLists.map(item => (
                                        <TopList
                                            key={item.title}
                                            title={item.title}
                                            sortFn={item.sortFn}
                                            valFn={item.valFn}
                                            fmtVal={item.fmtVal}
                                        />
                                    ))}
                                </div>
                            )}

                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    console.log('Opening permalink:', log.permalink);
                                    if (log.permalink) {
                                        try {
                                            const result = await window.electronAPI.openExternal(log.permalink);
                                            console.log('Open external result:', result);
                                            if (!result || !result.success) {
                                                console.error('Failed to open link via Electron:', result?.error || 'No result returned');
                                                window.open(log.permalink, '_blank');
                                            }
                                        } catch (err) {
                                            console.error('Error calling openExternal:', err);
                                            window.open(log.permalink, '_blank');
                                        }
                                    } else {
                                        console.warn('No permalink available for this log');
                                    }
                                }}
                                disabled={!log.permalink}
                                className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg border active:scale-[0.98] ${!log.permalink
                                    ? 'bg-blue-600/50 text-white/50 border-blue-400/10 cursor-not-allowed'
                                    : 'bg-blue-600/90 text-white hover:bg-blue-600 border-blue-400/20'
                                    }`}
                            >
                                <ExternalLink className="w-4 h-4" />
                                <span>{log.permalink ? 'Open dps.report Report' : 'Link Pending...'}</span>
                            </button>
                        </div>
                    </motion.div>
                )
                }
            </AnimatePresence >
        </motion.div >
    );
}
