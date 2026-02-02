import { Maximize2, Shield, X } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';

type DefenseSectionProps = {
    stats: any;
    DEFENSE_METRICS: Array<{ id: string; label: string }>;
    defenseSearch: string;
    setDefenseSearch: (value: string) => void;
    activeDefenseStat: string;
    setActiveDefenseStat: (value: string) => void;
    defenseViewMode: 'total' | 'per1s' | 'per60s';
    setDefenseViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    roundCountStats: boolean;
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

export const DefenseSection = ({
    stats,
    DEFENSE_METRICS,
    defenseSearch,
    setDefenseSearch,
    activeDefenseStat,
    setActiveDefenseStat,
    defenseViewMode,
    setDefenseViewMode,
    roundCountStats,
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
}: DefenseSectionProps) => (
    <div
        id="defense-detailed"
        data-section-visible={isSectionVisible('defense-detailed')}
        data-section-first={isFirstVisibleSection('defense-detailed')}
        className={sectionClass('defense-detailed', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
            expandedSection === 'defense-detailed'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Shield className="w-5 h-5 text-sky-300" />
                Defenses - Detailed
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'defense-detailed' ? closeExpandedSection() : openExpandedSection('defense-detailed'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'defense-detailed' ? 'Close Defense Detailed' : 'Expand Defense Detailed'}
                title={expandedSection === 'defense-detailed' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'defense-detailed' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {stats.defensePlayers.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No defensive stats available</div>
        ) : (
            <StatsTableLayout
                expanded={expandedSection === 'defense-detailed'}
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'defense-detailed' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'defense-detailed' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Defensive Tabs</div>
                        <input
                            value={defenseSearch}
                            onChange={(e) => setDefenseSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'defense-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                const filtered = DEFENSE_METRICS.filter((metric) =>
                                    metric.label.toLowerCase().includes(defenseSearch.trim().toLowerCase())
                                );
                                if (filtered.length === 0) {
                                    return <div className="text-center text-gray-500 italic py-6 text-xs">No defensive stats match this filter</div>;
                                }
                                return filtered.map((metric) => (
                                    <button
                                        key={metric.id}
                                        onClick={() => setActiveDefenseStat(metric.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeDefenseStat === metric.id
                                            ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
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
                            const metric = DEFENSE_METRICS.find((entry) => entry.id === activeDefenseStat) || DEFENSE_METRICS[0];
                            const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                            const rows = [...stats.defensePlayers]
                                .map((row: any) => ({
                                    ...row,
                                    total: row.defenseTotals?.[metric.id] || 0,
                                    per1s: (row.defenseTotals?.[metric.id] || 0) / totalSeconds(row),
                                    per60s: ((row.defenseTotals?.[metric.id] || 0) * 60) / totalSeconds(row)
                                }))
                                .sort((a, b) => {
                                    const aValue = defenseViewMode === 'total' ? a.total : defenseViewMode === 'per1s' ? a.per1s : a.per60s;
                                    const bValue = defenseViewMode === 'total' ? b.total : defenseViewMode === 'per1s' ? b.per1s : b.per60s;
                                    return bValue - aValue || a.account.localeCompare(b.account);
                                });

                            return (
                                <StatsTableShell
                                    expanded={expandedSection === 'defense-detailed'}
                                    header={
                                        <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                            <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                            <div className="text-xs uppercase tracking-widest text-gray-500">Defensive</div>
                                        </div>
                                    }
                                    columns={
                                        <>
                                            <div className="flex items-center justify-end px-4 py-2 bg-white/5">
                                                <PillToggleGroup
                                                    value={defenseViewMode}
                                                    onChange={setDefenseViewMode}
                                                    options={[
                                                        { value: 'total', label: 'Total' },
                                                        { value: 'per1s', label: 'Stat/1s' },
                                                        { value: 'per60s', label: 'Stat/60s' }
                                                    ]}
                                                    activeClassName="bg-sky-500/20 text-sky-200 border border-sky-500/40"
                                                    inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                />
                                            </div>
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <div className="text-right">
                                                    {defenseViewMode === 'total' ? 'Total' : defenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
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
                                                            const value = defenseViewMode === 'total'
                                                                ? row.total
                                                                : defenseViewMode === 'per1s'
                                                                    ? row.per1s
                                                                    : row.per60s;
                                                            const decimals = roundCountStats && defenseViewMode === 'total' ? 0 : 2;
                                                            return formatWithCommas(value, decimals);
                                                        })()}
                                                    </div>
                                                    <div className="text-right font-mono text-gray-400">
                                                        {row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}
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
