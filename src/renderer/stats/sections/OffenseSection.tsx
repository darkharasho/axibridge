import { Maximize2, Swords, X } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';

type OffenseSectionProps = {
    stats: any;
    OFFENSE_METRICS: Array<{
        id: string;
        label: string;
        isRate?: boolean;
        isPercent?: boolean;
    }>;
    roundCountStats: boolean;
    offenseSearch: string;
    setOffenseSearch: (value: string) => void;
    activeOffenseStat: string;
    setActiveOffenseStat: (value: string) => void;
    offenseViewMode: 'total' | 'per1s' | 'per60s';
    setOffenseViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    formatWithCommas: (value: number, decimals: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
};

export const OffenseSection = ({
    stats,
    OFFENSE_METRICS,
    roundCountStats,
    offenseSearch,
    setOffenseSearch,
    activeOffenseStat,
    setActiveOffenseStat,
    offenseViewMode,
    setOffenseViewMode,
    formatWithCommas,
    renderProfessionIcon,
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass
}: OffenseSectionProps) => (
    <div
        id="offense-detailed"
        data-section-visible={isSectionVisible('offense-detailed')}
        data-section-first={isFirstVisibleSection('offense-detailed')}
        className={sectionClass('offense-detailed', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
            expandedSection === 'offense-detailed'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Swords className="w-5 h-5 text-rose-300" />
                Offenses - Detailed
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'offense-detailed' ? closeExpandedSection() : openExpandedSection('offense-detailed'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'offense-detailed' ? 'Close Offense Detailed' : 'Expand Offense Detailed'}
                title={expandedSection === 'offense-detailed' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'offense-detailed' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {stats.offensePlayers.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No offensive stats available</div>
        ) : (
            <StatsTableLayout
                expanded={expandedSection === 'offense-detailed'}
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'offense-detailed' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'offense-detailed' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Offensive Tabs</div>
                        <input
                            value={offenseSearch}
                            onChange={(e) => setOffenseSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'offense-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                const filtered = OFFENSE_METRICS.filter((metric) =>
                                    metric.label.toLowerCase().includes(offenseSearch.trim().toLowerCase())
                                );
                                if (filtered.length === 0) {
                                    return <div className="text-center text-gray-500 italic py-6 text-xs">No offensive stats match this filter</div>;
                                }
                                return filtered.map((metric) => (
                                    <button
                                        key={metric.id}
                                        onClick={() => setActiveOffenseStat(metric.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeOffenseStat === metric.id
                                            ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                                            : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
                                    >
                                        {metric.label}
                                    </button>
                                ));
                            })()}
                        </div>
                    </>
                }
                content={
                    <>
                        {(() => {
                            const metric = OFFENSE_METRICS.find((entry) => entry.id === activeOffenseStat) || OFFENSE_METRICS[0];
                            const totalSeconds = (row: any) => Math.max(1, (row.totalFightMs || 0) / 1000);
                            const totalValue = (row: any) => {
                                if (metric.id === 'downContributionPercent') {
                                    const downContribution = row.offenseTotals?.downContribution || 0;
                                    const totalDamage = row.offenseTotals?.damage || 0;
                                    return totalDamage > 0 ? (downContribution / totalDamage) * 100 : 0;
                                }
                                if (metric.isRate) {
                                    const denom = row.offenseRateWeights?.[metric.id] || 0;
                                    const numer = row.offenseTotals?.[metric.id] || 0;
                                    return denom > 0 ? (numer / denom) * 100 : 0;
                                }
                                return row.offenseTotals?.[metric.id] || 0;
                            };
                            const formatValue = (val: number) => {
                                const decimals = roundCountStats && !metric.isPercent && offenseViewMode === 'total' ? 0 : 2;
                                const formatted = formatWithCommas(val, decimals);
                                return metric.isPercent ? `${formatted}%` : formatted;
                            };
                            const rows = [...stats.offensePlayers]
                                .map((row: any) => ({
                                    ...row,
                                    total: totalValue(row),
                                    per1s: metric.isPercent || metric.isRate ? totalValue(row) : totalValue(row) / totalSeconds(row),
                                    per60s: metric.isPercent || metric.isRate ? totalValue(row) : (totalValue(row) * 60) / totalSeconds(row)
                                }))
                                .sort((a, b) => {
                                    const aValue = offenseViewMode === 'total' ? a.total : offenseViewMode === 'per1s' ? a.per1s : a.per60s;
                                    const bValue = offenseViewMode === 'total' ? b.total : offenseViewMode === 'per1s' ? b.per1s : b.per60s;
                                    return bValue - aValue || a.account.localeCompare(b.account);
                                });

                            return (
                                <StatsTableShell
                                    expanded={expandedSection === 'offense-detailed'}
                                    header={
                                        <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                            <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                            <div className="text-xs uppercase tracking-widest text-gray-500">Offensive</div>
                                        </div>
                                    }
                                    columns={
                                        <>
                                            <div className="flex items-center justify-end gap-2 px-4 py-2 bg-white/5">
                                                <PillToggleGroup
                                                    value={offenseViewMode}
                                                    onChange={setOffenseViewMode}
                                                    options={[
                                                        { value: 'total', label: 'Total' },
                                                        { value: 'per1s', label: 'Stat/1s' },
                                                        { value: 'per60s', label: 'Stat/60s' }
                                                    ]}
                                                    activeClassName="bg-rose-500/20 text-rose-200 border border-rose-500/40"
                                                    inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                />
                                            </div>
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <div className="text-right">
                                                    {offenseViewMode === 'total' ? 'Total' : offenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                </div>
                                                <div className="text-right">Fight Time</div>
                                            </div>
                                        </>
                                    }
                                    rows={
                                        <>
                                            {rows.map((row: any, idx: number) => (
                                                <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                    <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                        <span className="truncate">{row.account}</span>
                                                    </div>
                                                    <div className="text-right font-mono text-gray-300">
                                                        {(() => {
                                                            const value = offenseViewMode === 'total'
                                                                ? row.total
                                                                : offenseViewMode === 'per1s'
                                                                    ? row.per1s
                                                                    : row.per60s;
                                                            return formatValue(value);
                                                        })()}
                                                    </div>
                                                    <div className="text-right font-mono text-gray-400">
                                                        {row.totalFightMs ? `${(row.totalFightMs / 1000).toFixed(1)}s` : '-'}
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    }
                                />
                            );
                        })()}
                    </>
                }
            />
        )}
    </div>
);
