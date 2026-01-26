import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { calculateAllStability, calculateDownContribution, calculateIncomingStats, calculateOutCC, calculateSquadBarrier, calculateSquadHealing } from '../shared/plenbot';
import { Player } from '../shared/dpsReportTypes';

interface ExpandableLogCardProps {
    log: any;
    isExpanded: boolean;
    onToggle: () => void;
    screenshotMode?: boolean;
}

export function ExpandableLogCard({ log, isExpanded, onToggle, screenshotMode }: ExpandableLogCardProps) {
    const details = log.details || {};
    const players: Player[] = details.players || [];
    const targets = details.targets || [];
    calculateAllStability(players);
    const squadPlayers = players.filter((p: any) => !p.notInSquad);
    const nonSquadPlayers = players.filter((p: any) => p.notInSquad);

    const isUploading = log.status === 'uploading';
    const hasError = log.status === 'error';
    const isDiscord = log.status === 'discord';

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

    // Helper for rendering top lists
    const TopList = ({ title, sortFn, valFn, fmtVal }: { title: string, sortFn: (a: any, b: any) => number, valFn: (p: any) => any, fmtVal: (v: any) => string }) => {
        const top = [...players].sort(sortFn).slice(0, 5);
        const hasData = top.some(p => {
            const val = valFn(p);
            return val > 0 || (typeof val === 'string' && val !== '0');
        });

        return (
            <div className="bg-white/5 rounded-lg p-3 border border-white/5 shadow-inner">
                <h5 className="font-semibold text-gray-200 mb-2 border-b border-white/10 pb-1 text-[11px] uppercase tracking-tighter">{title}</h5>
                {hasData ? (
                    <div className="font-mono text-[10px] space-y-1 text-gray-300">
                        {top.map((p, i) => {
                            const val = valFn(p);
                            if (val <= 0 && (typeof val !== 'string' || val === '0')) return null;
                            return (
                                <div key={`${p.account}-${i}`} className="flex justify-between gap-2 border-b border-white/5 last:border-0 pb-0.5">
                                    <span className="truncate flex-1">
                                        <span className="text-gray-500 mr-1">{i + 1}</span>
                                        {p.name || p.character_name || p.account}
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

    if (screenshotMode) {
        return (
            <div id={`log-screenshot-${log.id || log.filePath}`} className="bg-slate-900 border border-white/20 rounded-2xl overflow-hidden w-[900px] shadow-2xl p-0 m-0">
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
                <div className="p-6 space-y-6 bg-black/40">
                    <div className="grid grid-cols-2 gap-4 text-base">
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
                    </div>
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
                    <div className="grid grid-cols-2 gap-4">
                        <TopList title="Damage" sortFn={(a, b) => (b.dpsAll?.[0]?.damage || 0) - (a.dpsAll?.[0]?.damage || 0)} valFn={p => p.dpsAll?.[0]?.damage || 0} fmtVal={v => v.toLocaleString()} />
                        <TopList title="Down Contribution" sortFn={(a, b) => calculateDownContribution(b) - calculateDownContribution(a)} valFn={p => calculateDownContribution(p)} fmtVal={v => v.toLocaleString()} />
                        <TopList title="Healing" sortFn={(a, b) => calculateSquadHealing(b) - calculateSquadHealing(a)} valFn={p => calculateSquadHealing(p)} fmtVal={v => v.toLocaleString()} />
                        <TopList title="Barrier" sortFn={(a, b) => calculateSquadBarrier(b) - calculateSquadBarrier(a)} valFn={p => calculateSquadBarrier(p)} fmtVal={v => v.toLocaleString()} />
                        <TopList title="Cleanses" sortFn={(a, b) => ((b.support?.[0]?.condiCleanse || 0) + (b.support?.[0]?.condiCleanseSelf || 0)) - ((a.support?.[0]?.condiCleanse || 0) + (a.support?.[0]?.condiCleanseSelf || 0))} valFn={p => (p.support?.[0]?.condiCleanse || 0) + (p.support?.[0]?.condiCleanseSelf || 0)} fmtVal={v => v.toString()} />
                        <TopList title="Strips" sortFn={(a, b) => (b.support?.[0]?.boonStrips || 0) - (a.support?.[0]?.boonStrips || 0)} valFn={p => p.support?.[0]?.boonStrips || 0} fmtVal={v => v.toString()} />
                        <TopList title="CC" sortFn={(a, b) => calculateOutCC(b) - calculateOutCC(a)} valFn={p => calculateOutCC(p)} fmtVal={v => v.toLocaleString()} />
                        <TopList title="Stability" sortFn={(a, b) => (b.stabGeneration || 0) - (a.stabGeneration || 0)} valFn={p => p.stabGeneration || 0} fmtVal={v => v.toLocaleString()} />
                    </div>
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
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all shrink-0 ${isUploading ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 animate-pulse' :
                    isDiscord ? 'bg-purple-500/20 border-purple-500/30 text-purple-400 animate-pulse' :
                        hasError ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                            'bg-green-500/20 border-green-500/30 text-green-400'
                    }`}>
                    <span className="font-bold text-xs uppercase">
                        {isUploading ? '...' : isDiscord ? 'DC' : hasError ? 'ERR' : 'LOG'}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className="text-sm font-bold text-gray-200 truncate">{details.fightName || log.fightName || log.filePath.split(/[\\\/]/).pop()}</h4>
                        <span className="text-xs text-gray-500 font-mono">{details.encounterDuration || log.encounterDuration || '--:--'}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{players.length || (isUploading || isDiscord ? 'Scanning...' : '0')} Players {nonSquadPlayers.length > 0 ? `(${squadPlayers.length} +${nonSquadPlayers.length})` : ''}</span>
                        <span>•</span>
                        <span>{(log.uploadTime || details.uploadTime)
                            ? new Date((log.uploadTime || details.uploadTime) * 1000).toLocaleTimeString()
                            : (isUploading || isDiscord ? 'Processing...' : 'Just now')}</span>
                    </div>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    disabled={!log.details && !isExpanded}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${!log.details
                        ? 'bg-white/5 text-gray-600 border-white/5 cursor-not-allowed opacity-50'
                        : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white group-hover:border-white/20'
                        }`}
                >
                    {isExpanded ? <><ChevronUp className="w-3 h-3" /><span>Hide</span></> : <><ChevronDown className="w-3 h-3" /><span>Details</span></>}
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
                            {/* Summaries Row */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
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
                            </div>

                            {/* Incoming Stats Row */}
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

                            {/* Top Lists Sections */}
                            <div className="grid grid-cols-2 gap-3">
                                <TopList
                                    title="Damage"
                                    sortFn={(a, b) => (b.dpsAll?.[0]?.damage || 0) - (a.dpsAll?.[0]?.damage || 0)}
                                    valFn={p => p.dpsAll?.[0]?.damage || 0}
                                    fmtVal={v => v.toLocaleString()}
                                />
                                <TopList
                                    title="Down Contribution"
                                    sortFn={(a, b) => calculateDownContribution(b) - calculateDownContribution(a)}
                                    valFn={p => calculateDownContribution(p)}
                                    fmtVal={v => v.toLocaleString()}
                                />

                                <TopList
                                    title="Healing"
                                    sortFn={(a, b) => calculateSquadHealing(b) - calculateSquadHealing(a)}
                                    valFn={p => calculateSquadHealing(p)}
                                    fmtVal={v => v.toLocaleString()}
                                />
                                <TopList
                                    title="Barrier"
                                    sortFn={(a, b) => calculateSquadBarrier(b) - calculateSquadBarrier(a)}
                                    valFn={p => calculateSquadBarrier(p)}
                                    fmtVal={v => v.toLocaleString()}
                                />
                                <TopList
                                    title="Cleanses"
                                    sortFn={(a, b) => ((b.support?.[0]?.condiCleanse || 0) + (b.support?.[0]?.condiCleanseSelf || 0)) - ((a.support?.[0]?.condiCleanse || 0) + (a.support?.[0]?.condiCleanseSelf || 0))}
                                    valFn={p => (p.support?.[0]?.condiCleanse || 0) + (p.support?.[0]?.condiCleanseSelf || 0)}
                                    fmtVal={v => v.toString()}
                                />
                                <TopList
                                    title="Strips"
                                    sortFn={(a, b) => (b.support?.[0]?.boonStrips || 0) - (a.support?.[0]?.boonStrips || 0)}
                                    valFn={p => p.support?.[0]?.boonStrips || 0}
                                    fmtVal={v => v.toString()}
                                />
                                <TopList
                                    title="CC"
                                    sortFn={(a, b) => calculateOutCC(b) - calculateOutCC(a)}
                                    valFn={p => calculateOutCC(p)}
                                    fmtVal={v => v.toLocaleString()}
                                />
                                <TopList
                                    title="Stability"
                                    sortFn={(a, b) => (b.stabGeneration || 0) - (a.stabGeneration || 0)}
                                    valFn={p => p.stabGeneration || 0}
                                    fmtVal={v => v.toLocaleString()}
                                />
                            </div>

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
