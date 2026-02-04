import { forwardRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { applyStabilityGeneration, getIncomingDisruptions, getPlayerDamage, getPlayerDps, getPlayerDownsTaken, getPlayerDeaths, getPlayerDamageTaken, getPlayerDodges, getPlayerMissed, getPlayerBlocked, getPlayerEvaded, getPlayerResurrects, getPlayerDownContribution, getPlayerOutgoingCrowdControl, getPlayerSquadBarrier, getPlayerSquadHealing, getTargetStatTotal } from '../shared/dashboardMetrics';
import { Player } from '../shared/dpsReportTypes';
import { DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS, DisruptionMethod, IEmbedStatSettings } from './global.d';
import { getProfessionAbbrev, getProfessionEmoji, getProfessionIconPath } from '../shared/professionUtils';

interface ExpandableLogCardProps {
    log: any;
    isExpanded: boolean;
    onToggle: () => void;
    onCancel?: () => void;
    layoutEnabled?: boolean;
    motionEnabled?: boolean;
    screenshotMode?: boolean;
    embedStatSettings?: IEmbedStatSettings;
    disruptionMethod?: DisruptionMethod;
    useClassIcons?: boolean;
    screenshotSection?: {
        type: 'summary' | 'toplists' | 'tile';
        start?: number;
        count?: number;
        showHeader?: boolean;
        tileKind?: 'summary' | 'incoming' | 'toplist';
        tileId?: 'squad' | 'enemy' | 'squad-classes' | 'enemy-classes' | 'incoming-attacks' | 'incoming-cc' | 'incoming-strips' | 'incoming-blank';
        tileIndex?: number;
    };
}

const ExpandableLogCardBase = forwardRef<HTMLDivElement, ExpandableLogCardProps>(
    ({ log, isExpanded, onToggle, onCancel, layoutEnabled = true, motionEnabled = true, screenshotMode, embedStatSettings, disruptionMethod, screenshotSection, useClassIcons }, ref) => {
    const details = log.details || {};
    const players: Player[] = details.players || [];
    const targets = details.targets || [];
    const settings = embedStatSettings || DEFAULT_EMBED_STATS;
    const method = disruptionMethod || DEFAULT_DISRUPTION_METHOD;
    const squadPlayers = players.filter((p: any) => !p.notInSquad);
    const nonSquadPlayers = players.filter((p: any) => p.notInSquad);
    const shouldComputeDetails = isExpanded || screenshotMode || Boolean(screenshotSection);

    const isQueued = log.status === 'queued';
    const isPending = log.status === 'pending';
    const isUploading = log.status === 'uploading';
    const isRetrying = log.status === 'retrying';
    const isCalculating = log.status === 'calculating';
    const hasError = log.status === 'error';
    const isDiscord = log.status === 'discord';
    const playerCount = details.players?.length ?? log.playerCount ?? 0;
    const statusLabel = isQueued ? 'Queued'
        : isPending ? 'Pending'
            : isUploading ? 'Parsing with dps.report'
                : isRetrying ? 'Retrying upload'
                : isCalculating ? 'Calculating statistics'
                    : isDiscord ? 'Preparing Discord preview'
                        : null;
    const isCancellable = Boolean(!log.details && !isExpanded && onCancel && (isQueued || isPending || isUploading || isRetrying));
    const resolveTimestampMs = () => {
        const raw = log.uploadTime || details.uploadTime;
        if (!raw) return null;
        const value = Number(raw);
        if (!Number.isFinite(value)) return null;
        return value > 1e12 ? value : value * 1000;
    };
    const formattedTime = () => {
        const ts = resolveTimestampMs();
        if (!ts) return 'Just now';
        return new Date(ts).toLocaleTimeString();
    };

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
    let enemyDowns = 0;
    let enemyDeaths = 0;
    let enemyCount = 0;
    let enemyDps = 0;

    const buildClassCounts = (list: Player[]) => {
        const counts: Record<string, number> = {};
        list.forEach((p: any) => {
            const prof = p.profession || 'Unknown';
            counts[prof] = (counts[prof] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([, count]) => count > 0)
            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
            .map(([profession, count]) => ({ profession, count }));
    };

    let squadClassCounts: Array<{ profession: string; count: number }> = [];
    let enemyClassCounts: Array<{ profession: string; count: number }> = [];

    if (shouldComputeDetails) {
        applyStabilityGeneration(players, { durationMS: details.durationMS, buffMap: details.buffMap });
        players.forEach((p: any) => {
            const isSquad = !p.notInSquad;
            totalDps += getPlayerDps(p);
            totalDmg += getPlayerDamage(p);
            if (isSquad) {
                squadDps += getPlayerDps(p);
                squadDmg += getPlayerDamage(p);
                squadCC += getPlayerOutgoingCrowdControl(p, method);
                squadResurrects += getPlayerResurrects(p);
            }
            totalDowns += getPlayerDownsTaken(p);
            totalDeaths += getPlayerDeaths(p);
            totalDmgTaken += getPlayerDamageTaken(p);
            if (isSquad) {
                squadDowns += getPlayerDownsTaken(p);
                squadDeaths += getPlayerDeaths(p);
            }
            totalMiss += getPlayerMissed(p);
            totalBlock += getPlayerBlocked(p);
            totalEvade += getPlayerEvaded(p);
            totalDodge += getPlayerDodges(p);

            const pStats = getIncomingDisruptions(p, method);
            totalCCTaken += pStats.cc.total;
            totalCCMissed += pStats.cc.missed;
            totalCCBlocked += pStats.cc.blocked;

            totalStripsTaken += pStats.strips.total;
            totalStripsMissed += pStats.strips.missed;
            totalStripsBlocked += pStats.strips.blocked;
        });

        // Calculate Enemy (Target) Stats - how many times WE downed/killed them
        // We aggregate from player statsTargets, which records what each player did to targets
        targets.forEach((t: any) => {
            if (!t.isFake) enemyCount++;
        });
        if (enemyCount === 0) {
            enemyCount = nonSquadPlayers.length;
        }

        // Aggregate downed/killed from statsTargets
        players.forEach((p: any) => {
            if (p.notInSquad) return; // Only count squad contributions
            enemyDowns += getTargetStatTotal(p, 'downed');
            enemyDeaths += getTargetStatTotal(p, 'killed');
        });

        // Calculate enemy DPS (damage they dealt to us per second)
        const durationSec = (details.durationMS || 0) / 1000 || 1;
        enemyDps = Math.round(totalDmgTaken / durationSec);

        squadClassCounts = buildClassCounts(squadPlayers);
        enemyClassCounts = (() => {
            const fromPlayers: Record<string, number> = {};
            nonSquadPlayers.forEach((p: any) => {
                const prof = String(p?.profession || '').trim();
                if (prof) fromPlayers[prof] = (fromPlayers[prof] || 0) + 1;
            });

            const fromTargets: Record<string, number> = {};
            const seenEnemyIdsInFight = new Set<string>();
            targets.forEach((t: any) => {
                if (t?.isFake) return;
                if (t?.enemyPlayer === false) return;
                const rawName = t?.name || 'Unknown';
                const rawId = t?.instanceID ?? t?.instid ?? t?.id ?? rawName;
                const nameText = String(rawName);
                const nameInstanceMatch = nameText.match(/\bpl-(\d+)\b/i);
                let idKey = '';
                if (nameInstanceMatch?.[1]) {
                    idKey = `pl-${nameInstanceMatch[1]}`;
                } else if (rawId !== undefined && rawId !== null && rawId !== '' && Number(rawId) > 0) {
                    // Include name with id because some logs reuse ids across multiple targets.
                    idKey = `id-${String(rawId)}-${nameText}`;
                } else {
                    idKey = nameText;
                }
                if (seenEnemyIdsInFight.has(idKey)) return;
                seenEnemyIdsInFight.add(idKey);

                const cleanName = nameText
                    .replace(/\s+pl-\d+$/i, '')
                    .replace(/\s*\([^)]*\)/, '')
                    .trim();
                fromTargets[cleanName] = (fromTargets[cleanName] || 0) + 1;
            });

            const playerTotal = Object.values(fromPlayers).reduce((sum, count) => sum + count, 0);
            const targetTotal = Object.values(fromTargets).reduce((sum, count) => sum + count, 0);
            const minExpectedFromPlayers = Math.max(3, Math.floor(enemyCount * 0.6));
            const usePlayerCounts = playerTotal > 0 && (enemyCount === 0 || playerTotal >= minExpectedFromPlayers || targetTotal === 0);
            const counts = usePlayerCounts ? fromPlayers : fromTargets;

            return Object.entries(counts)
                .filter(([, count]) => count > 0)
                .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
                .map(([profession, count]) => ({ profession, count }));
        })();
    }

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

    const renderClassSummary = (title: string, counts: Array<{ profession: string; count: number }>, colorClass: string, compact?: boolean, fullHeight?: boolean) => {
        const isTile = Boolean(fullHeight);
        const isEnemy = title.toLowerCase().includes('enemy');
        const maxItems = isTile ? 20 : (isEnemy ? 30 : undefined);
        let limitedCounts = counts;
        if (maxItems && counts.length > maxItems) {
            const overflowStart = maxItems;
            const overflowTotal = counts.slice(overflowStart).reduce((sum, item) => sum + item.count, 0);
            limitedCounts = [
                ...counts.slice(0, maxItems),
                { profession: '+', count: overflowTotal, isSummary: true } as any
            ];
        }
        const maxRows = fullHeight ? 7 : 10;
        const columns: Array<Array<{ profession: string; count: number }>> = [];
        for (let i = 0; i < limitedCounts.length; i += maxRows) {
            columns.push(limitedCounts.slice(i, i + maxRows));
        }
        const headerClass = compact
            ? `font-semibold ${colorClass} mb-2 uppercase tracking-wider text-[10px]`
            : `font-black ${colorClass} mb-3 uppercase tracking-widest ${fullHeight ? 'text-base' : 'text-xs'}`;
        return (
            <div className={`bg-white/5 rounded-xl ${compact ? 'p-3' : 'p-4'} border border-white/10 shadow-lg ${fullHeight ? 'h-full' : ''}`}>
                <h5 className={`${headerClass} border-b border-white/10 pb-2`}>{title}</h5>
                {limitedCounts.length > 0 ? (
                    <div className={`grid grid-flow-col auto-cols-fr gap-2 font-mono text-gray-200 ${fullHeight ? 'text-base' : compact ? 'text-[11px]' : 'text-sm'}`}>
                        {columns.map((column, columnIndex) => (
                            <div key={`${title}-col-${columnIndex}`} className="space-y-2">
                                {column.map(({ profession, count, isSummary }: any) => {
                                    if (isSummary) {
                                        return (
                                            <div key={`${title}-summary`} className="flex items-center justify-between gap-2 bg-white/5 rounded-md px-2 py-1 border border-white/10">
                                                <span className="text-gray-300">{`+ ${count}`}</span>
                                                <span />
                                            </div>
                                        );
                                    }
                                    const iconPath = getProfessionIconPath(profession);
                                    const label = getProfessionAbbrev(profession).toUpperCase();
                                    return (
                                        <div key={profession} className="flex items-center justify-between gap-2 bg-white/5 rounded-md px-2 py-1 border border-white/10">
                                            <span className="flex items-center gap-1 text-gray-100">
                                                {useClassIcons && iconPath ? (
                                                    <img
                                                        src={iconPath}
                                                        alt={profession}
                                                        className={fullHeight ? 'w-5 h-5' : 'w-4 h-4'}
                                                    />
                                                ) : (
                                                    <span className="uppercase text-gray-400">{label}</span>
                                                )}
                                                {useClassIcons && iconPath ? (
                                                    <span className="uppercase text-gray-400">{label}</span>
                                                ) : null}
                                            </span>
                                            <span className="font-bold text-white">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-xs text-gray-500 italic text-center py-2">No Data</div>
                )}
            </div>
        );
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
            sortFn: (a: any, b: any) => getPlayerDownContribution(b) - getPlayerDownContribution(a),
            valFn: (p: any) => getPlayerDownContribution(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showHealing,
            title: "Healing",
            sortFn: (a: any, b: any) => getPlayerSquadHealing(b) - getPlayerSquadHealing(a),
            valFn: (p: any) => getPlayerSquadHealing(p),
            fmtVal: (v: number) => v.toLocaleString()
        },
        {
            enabled: settings.showBarrier,
            title: "Barrier",
            sortFn: (a: any, b: any) => getPlayerSquadBarrier(b) - getPlayerSquadBarrier(a),
            valFn: (p: any) => getPlayerSquadBarrier(p),
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
            sortFn: (a: any, b: any) => getPlayerOutgoingCrowdControl(b, method) - getPlayerOutgoingCrowdControl(a, method),
            valFn: (p: any) => getPlayerOutgoingCrowdControl(p, method),
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
    const showClassSummary = settings.showClassSummary;
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
            <div className={`bg-white/5 rounded-lg p-4 border border-white/10 ${fullHeight ? 'h-full overflow-hidden' : ''}`}>
                <h5 className={`font-bold ${color} mb-1 uppercase tracking-tight leading-none ${fullHeight ? 'text-[9px]' : 'text-[10px]'}`}>{label}</h5>
                <div className={`font-mono text-gray-300 text-left space-y-0.5 ${fullHeight ? 'text-[9px]' : 'text-xs'}`}>
                    <div className="flex justify-between text-gray-500"><span>Miss:</span> <span>{miss}</span></div>
                    <div className="flex justify-between text-gray-500"><span>Block:</span> <span>{block}</span></div>
                    <div className="flex justify-between text-white font-bold pt-0.5 border-t border-white/5"><span>Total:</span> <span>{total}</span></div>
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
                    if (screenshotSection.tileId === 'squad-classes' && showClassSummary) return renderClassSummary('Squad Classes', squadClassCounts, 'text-green-400', true, true);
                    if (screenshotSection.tileId === 'enemy-classes' && showClassSummary) return renderClassSummary('Enemy Classes', enemyClassCounts, 'text-red-400', true, true);
                }
                if (screenshotSection.tileKind === 'incoming') {
                    if (screenshotSection.tileId === 'incoming-attacks') return renderIncoming('attacks', true);
                    if (screenshotSection.tileId === 'incoming-cc') return renderIncoming('cc', true);
                    if (screenshotSection.tileId === 'incoming-strips') return renderIncoming('strips', true);
                    if (screenshotSection.tileId === 'incoming-blank') {
                        return (
                            <div
                                className="w-full h-full bg-transparent flex items-center justify-center p-0 m-0"
                            >
                                &nbsp;
                            </div>
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
                    style={{
                        width: screenshotSection.tileKind === 'incoming' ? '180px' : '360px',
                        height: screenshotSection.tileKind === 'incoming' ? '140px' : '360px',
                        minWidth: screenshotSection.tileKind === 'incoming' ? '180px' : '360px',
                        minHeight: screenshotSection.tileKind === 'incoming' ? '140px' : '360px'
                    }}
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
                                <span>{formattedTime()}</span>
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
                    {(screenshotSection?.type !== 'toplists' && showSummarySection && showClassSummary) && (
                        <div className="grid grid-cols-2 gap-4 text-base">
                            {settings.showSquadSummary && (
                                renderClassSummary('Squad Classes', squadClassCounts, 'text-green-400')
                            )}
                            {settings.showEnemySummary && (
                                renderClassSummary('Enemy Classes', enemyClassCounts, 'text-red-400')
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

    const Container: any = motionEnabled ? motion.div : 'div';
    const motionProps = motionEnabled
        ? {
            initial: { opacity: 0, x: 20, scale: 0.95 },
            animate: { opacity: 1, x: 0, scale: 1 },
            exit: { opacity: 0, scale: 0.9 },
            layout: layoutEnabled
        }
        : {};

    return (
        <Container
            ref={ref}
            {...motionProps}
            className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all mb-3 group shadow-xl"
        >
            {/* Collapsed View */}
            <div className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all shrink-0 ${isQueued ? 'bg-slate-500/20 border-slate-400/30 text-slate-300 animate-pulse' :
                    isPending ? 'bg-slate-500/20 border-slate-400/30 text-slate-300 animate-pulse' :
                        isUploading ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 animate-pulse' :
                            isCalculating ? 'bg-amber-500/20 border-amber-400/30 text-amber-300 animate-pulse' :
                                isDiscord ? 'bg-purple-500/20 border-purple-500/30 text-purple-400 animate-pulse' :
                                    hasError ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                                        'bg-green-500/20 border-green-500/30 text-green-400'
                    }`}>
                    <span className="font-bold text-xs uppercase">
                        {isQueued ? 'QUE' : isPending ? 'PEN' : isUploading ? '...' : isCalculating ? 'CAL' : isDiscord ? 'DC' : hasError ? 'ERR' : 'LOG'}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <h4 className="text-sm font-bold text-gray-200 truncate">{details.fightName || log.fightName || log.filePath.split(/[\\\/]/).pop()}</h4>
                        <span className="text-xs text-gray-500 font-mono">{details.encounterDuration || log.encounterDuration || '--:--'}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{statusLabel ? statusLabel : `${playerCount || '0'} Players${nonSquadPlayers.length > 0 ? ` (${squadPlayers.length} +${nonSquadPlayers.length})` : ''}`}</span>
                        <span>•</span>
                        <span>{formattedTime()}</span>
                    </div>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isCancellable) {
                            onCancel?.();
                            return;
                        }
                        onToggle();
                    }}
                    disabled={Boolean(log.detailsLoading) || (!log.details && !isExpanded && !onCancel)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${isCancellable
                        ? 'bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20'
                        : log.detailsLoading
                            ? 'bg-white/5 text-gray-500 border-white/10 cursor-not-allowed'
                            : !log.details && !isExpanded && !onCancel
                                ? 'bg-white/5 text-gray-600 border-white/5 cursor-not-allowed opacity-50'
                                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white group-hover:border-white/20'
                        }`}
                >
                    {isCancellable ? (
                        <><span>Cancel</span></>
                    ) : log.detailsLoading ? (
                        <><span>Loading…</span></>
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
                            {(settings.showSquadSummary || settings.showEnemySummary) && showClassSummary && (
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    {settings.showSquadSummary && (
                                        renderClassSummary('Squad Classes', squadClassCounts, 'text-green-400', true)
                                    )}
                                    {settings.showEnemySummary && (
                                        renderClassSummary('Enemy Classes', enemyClassCounts, 'text-red-400', true)
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
        </Container >
    );
});

const areEqual = (prev: ExpandableLogCardProps, next: ExpandableLogCardProps) => {
    return prev.log === next.log
        && prev.isExpanded === next.isExpanded
        && prev.layoutEnabled === next.layoutEnabled
        && prev.motionEnabled === next.motionEnabled
        && prev.screenshotMode === next.screenshotMode
        && prev.embedStatSettings === next.embedStatSettings
        && prev.disruptionMethod === next.disruptionMethod
        && prev.screenshotSection === next.screenshotSection
        && prev.useClassIcons === next.useClassIcons;
};

export const ExpandableLogCard = memo(ExpandableLogCardBase, areEqual);

ExpandableLogCard.displayName = 'ExpandableLogCard';
