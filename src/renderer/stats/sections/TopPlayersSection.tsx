import { Activity, Crown, Crosshair, Flame, Hammer, HelpingHand, Shield, ShieldCheck, Sparkles, Star, Trophy, Wind, Zap } from 'lucide-react';

type TopPlayersSectionProps = {
    stats: any;
    showTopStats: boolean;
    showMvp: boolean;
    topStatsMode: 'total' | 'perSecond';
    expandedLeader: string | null;
    setExpandedLeader: (value: string | null | ((prev: string | null) => string | null)) => void;
    formatTopStatValue: (value: number) => string;
    formatWithCommas: (value: number, decimals?: number) => string;
    isMvpStatEnabled: (name: string) => boolean;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

const colorClasses: Record<string, { bg: string; text: string }> = {
    red: { bg: 'bg-red-500/20', text: 'text-red-400' },
    yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    green: { bg: 'bg-green-500/20', text: 'text-green-400' },
    purple: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    pink: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
    cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
    indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400' }
};

const LeaderCard = ({ icon: Icon, title, data, color, unit = '', onClick, active, rows, formatValue, renderProfessionIcon }: any) => {
    const classes = colorClasses[color] || colorClasses.blue;
    const value = data?.value ?? 0;
    const displayValue = formatValue ? formatValue(value) : Math.round(value).toLocaleString();
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick?.();
                }
            }}
            className={`bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 group hover:bg-white/10 transition-colors cursor-pointer ${active ? 'ring-1 ring-white/20' : ''}`}
        >
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${classes.bg} ${classes.text} shrink-0`}>
                    <Icon className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-gray-400 text-xs font-bold uppercase tracking-wider truncate">{title}</div>
                    <div className="text-2xl font-bold text-white mt-0.5 break-words">
                        {displayValue} <span className="text-sm font-normal text-gray-500">{unit}</span>
                    </div>
                </div>
            </div>
            <div className="flex flex-col border-t border-white/5 pt-2">
                <div className="flex items-center gap-2 min-w-0">
                    {renderProfessionIcon(data?.profession || 'Unknown', data?.professionList, 'w-4 h-4')}
                    <div className="text-sm font-medium text-blue-300 truncate">{data?.player || '-'}</div>
                </div>
                <div className="text-xs text-gray-500 truncate">{data?.count ? `${data.count} logs` : '-'}</div>
            </div>
            {active && (
                <div className="mt-3 stats-share-exclude">
                    <div className="text-xs font-semibold text-gray-200 mb-2">{title}</div>
                    {rows?.length ? (
                        <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                            {rows.map((row: any) => (
                                <div key={`${title}-${row.rank}-${row.account}`} className="flex items-center gap-2 text-xs text-gray-300">
                                    <div className="w-6 text-right text-gray-500">{row.rank}</div>
                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                    <div className="flex-1 truncate">{row.account}</div>
                                    <div className="text-gray-400 font-mono">{formatValue ? formatValue(row.value) : row.value}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-gray-500 italic">No data available</div>
                    )}
                </div>
            )}
        </div>
    );
};

export const TopPlayersSection = ({
    stats,
    showTopStats,
    showMvp,
    topStatsMode,
    expandedLeader,
    setExpandedLeader,
    formatTopStatValue,
    formatWithCommas,
    isMvpStatEnabled,
    renderProfessionIcon,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: TopPlayersSectionProps) => {
    if (!showTopStats) return null;
    return (
        <div
            id="top-players"
            data-section-visible={isSectionVisible('top-players')}
            data-section-first={isFirstVisibleSection('top-players')}
            className={sectionClass('top-players', 'scroll-mt-24')}
        >
            <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Top Players (Total Accumulated Stats)
            </h3>
            {showMvp && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)] gap-3 mb-6">
                    <div className="mvp-card mvp-card--gold border border-yellow-500/30 rounded-2xl p-3 relative overflow-hidden group flex items-center">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-yellow-500/20 transition-all" />

                        <div className="flex items-center gap-5 relative z-10 w-full">
                            <div className="hidden sm:flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/20 border border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                                <Crown className="w-10 h-10 text-yellow-400" />
                            </div>

                            <div className="flex-1 flex flex-col h-full">
                                <div className="flex items-center gap-2 mb-1">
                                    <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                                    <span className="text-yellow-400 font-bold uppercase tracking-widest text-xs">Squad MVP</span>
                                </div>
                                <div className="text-2xl sm:text-3xl font-black text-white mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                                    <span className="min-w-0 max-w-full truncate">{stats.mvp.account}</span>
                                    {renderProfessionIcon(stats.mvp.profession, stats.mvp.professionList, 'w-6 h-6')}
                                    <span className="text-sm sm:text-lg font-medium text-yellow-200/70 bg-white/5 px-2 py-0.5 rounded border border-yellow-500/20 max-w-full truncate">
                                        {stats.mvp.profession}
                                    </span>
                                </div>
                                <p className="text-yellow-200/80 italic flex items-center gap-2 mb-2">
                                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-500/40" />
                                    "{stats.mvp.reason}"
                                </p>

                                <div className="mt-auto flex flex-wrap gap-2">
                                    {stats.mvp.topStats && stats.mvp.topStats.filter((stat: any) => isMvpStatEnabled(stat.name)).map((stat: any, i: number) => {
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
                                            <div key={i} className="inline-flex items-baseline gap-2 px-2.5 py-0.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-[11px] leading-none">
                                                <span className="text-yellow-200 font-bold">{stat.name}</span>
                                                <span className="text-yellow-50 font-mono tabular-nums">{stat.val}</span>
                                                <span className="text-yellow-400/60">({rank}{suffix})</span>
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

                    <div className="grid grid-cols-2 xl:grid-cols-1 gap-3">
                        {[
                            { label: 'Silver', data: stats.silver },
                            { label: 'Bronze', data: stats.bronze }
                        ].map((entry) => (
                            <div
                                key={entry.label}
                                className={`mvp-card mvp-card--${entry.label.toLowerCase()} border border-white/10 rounded-2xl p-3 relative overflow-hidden group flex flex-col`}
                            >
                                <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-[70px] pointer-events-none transition-all ${entry.label === 'Silver'
                                    ? 'bg-slate-300/15 group-hover:bg-slate-300/25'
                                    : 'bg-orange-400/15 group-hover:bg-orange-400/25'
                                    }`} />
                                <div className="flex items-center justify-between mb-1">
                                    <div className={`text-xs uppercase tracking-widest font-semibold ${entry.label === 'Silver' ? 'text-slate-200' : 'text-orange-200'}`}>
                                        {entry.label} MVP
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">
                                        {entry.data?.score ? entry.data.score.toFixed(1) : '-'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 mb-2">
                                    {entry.data && renderProfessionIcon(entry.data.profession, entry.data.professionList, 'w-6 h-6')}
                                    <div className="min-w-0 flex-1">
                                        <div className={`text-base font-semibold ${entry.label === 'Silver' ? 'text-slate-100' : 'text-orange-100'} truncate`}>
                                            {entry.data?.account || '—'}
                                        </div>
                                        <div className={`text-xs ${entry.label === 'Silver' ? 'text-slate-300/70' : 'text-orange-200/70'} truncate`}>
                                            {entry.data?.profession || 'Unknown'}
                                        </div>
                                    </div>
                                </div>
                                {entry.data?.topStats?.some((stat: any) => isMvpStatEnabled(stat.name)) ? (
                                    <div className={`mt-auto flex flex-wrap items-center gap-2 text-[10px] ${entry.label === 'Silver' ? 'text-slate-200' : 'text-orange-200'}`}>
                                        {entry.data.topStats.filter((stat: any) => isMvpStatEnabled(stat.name)).map((stat: any, idx: number) => {
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
                                                <span
                                                    key={idx}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border leading-none ${entry.label === 'Silver'
                                                        ? 'bg-slate-400/10 border-slate-300/30'
                                                        : 'bg-orange-500/10 border-orange-400/30'
                                                        }`}
                                                >
                                                    <span className="leading-none">{stat.name}</span>
                                                    <span className="tabular-nums leading-none">{rank}{suffix}</span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(() => {
                const isPerSecond = topStatsMode === 'perSecond';
                const topStatsData = isPerSecond && stats.topStatsPerSecond ? stats.topStatsPerSecond : stats;
                const topStatsLeaderboards = isPerSecond && stats.topStatsLeaderboardsPerSecond
                    ? stats.topStatsLeaderboardsPerSecond
                    : stats.leaderboards;
                const titlePrefix = isPerSecond ? '' : 'Total ';
                const titleSuffix = isPerSecond ? ' /s' : '';
                const leaderCards = [
                    { icon: HelpingHand, title: `Down Contribution${titleSuffix}`, data: topStatsData.maxDownContrib, color: 'red', statKey: 'downContrib' },
                    { icon: Shield, title: `${titlePrefix}Barrier${titleSuffix}`, data: topStatsData.maxBarrier, color: 'yellow', statKey: 'barrier' },
                    { icon: Activity, title: `${titlePrefix}Healing${titleSuffix}`, data: topStatsData.maxHealing, color: 'green', statKey: 'healing' },
                    { icon: Wind, title: `${titlePrefix}Dodges${titleSuffix}`, data: topStatsData.maxDodges, color: 'cyan', statKey: 'dodges' },
                    { icon: Zap, title: `${titlePrefix}Strips${titleSuffix}`, data: topStatsData.maxStrips, color: 'purple', statKey: 'strips' },
                    { icon: Flame, title: `${titlePrefix}Cleanses${titleSuffix}`, data: topStatsData.maxCleanses, color: 'blue', statKey: 'cleanses' },
                    { icon: Hammer, title: `${titlePrefix}CC${titleSuffix}`, data: topStatsData.maxCC, color: 'pink', statKey: 'cc' },
                    { icon: ShieldCheck, title: `${titlePrefix}Stab Gen${titleSuffix}`, data: topStatsData.maxStab, color: 'cyan', statKey: 'stability' },
                    { icon: Crosshair, title: 'Closest to Tag', data: topStatsData.closestToTag, color: 'indigo', unit: 'dist', statKey: 'closestToTag' }
                ];
                const formatValue = (value: number) => {
                    if (!isPerSecond || !Number.isFinite(value)) {
                        return formatTopStatValue(value);
                    }
                    return formatWithCommas(value, 2);
                };
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {leaderCards.map((card) => {
                            const isActive = expandedLeader === 'all';
                            const rows = topStatsLeaderboards?.[card.statKey] || [];
                            return (
                                <LeaderCard
                                    key={card.statKey}
                                    {...card}
                                    active={isActive}
                                    onClick={() => setExpandedLeader((prev) => (prev === 'all' ? null : 'all'))}
                                    rows={rows}
                                    formatValue={formatValue}
                                    renderProfessionIcon={renderProfessionIcon}
                                />
                            );
                        })}
                    </div>
                );
            })()}
        </div>
    );
};
