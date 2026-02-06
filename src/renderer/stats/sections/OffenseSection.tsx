import { useState } from 'react';
import { Maximize2, Swords, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
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
}: OffenseSectionProps) => {
    const [sortState, setSortState] = useState<{ key: 'value' | 'fightTime'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({
        columnId: OFFENSE_METRICS[0]?.id || 'value',
        dir: 'desc'
    });
    const isExpanded = expandedSection === 'offense-detailed';
    const [selectedOffenseColumnIds, setSelectedOffenseColumnIds] = useState<string[]>([]);
    const [selectedOffensePlayers, setSelectedOffensePlayers] = useState<string[]>([]);
    const filteredOffenseMetrics = OFFENSE_METRICS.filter((metric) =>
        metric.label.toLowerCase().includes(offenseSearch.trim().toLowerCase())
    );
    const offenseColumnOptions = OFFENSE_METRICS.map((metric) => ({ id: metric.id, label: metric.label }));
    const offenseColumnOptionsFiltered = offenseColumnOptions.filter((option) =>
        option.label.toLowerCase().includes(offenseSearch.trim().toLowerCase())
    );
    const selectedOffenseMetrics = selectedOffenseColumnIds.length > 0
        ? OFFENSE_METRICS.filter((metric) => selectedOffenseColumnIds.includes(metric.id))
        : OFFENSE_METRICS;
    const visibleOffenseMetrics = selectedOffenseMetrics;
    const offensePlayerOptions = Array.from(new Map(
        stats.offensePlayers.map((row: any) => [row.account, row])
    ).values()).map((row: any) => ({
        id: row.account,
        label: row.account,
        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
    }));
    const offenseSearchSelectedIds = new Set([
        ...selectedOffenseColumnIds.map((id) => `column:${id}`),
        ...selectedOffensePlayers.map((id) => `player:${id}`)
    ]);
    const updateSort = (key: 'value' | 'fightTime') => {
        setSortState((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    return (
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
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Offensive Tabs</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...offenseColumnOptions.map((option) => ({ ...option, type: 'column' as const })),
                                ...offensePlayerOptions.map((option) => ({ ...option, type: 'player' as const }))
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedOffenseColumnIds((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedOffensePlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={offenseSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <ColumnFilterDropdown
                            options={offenseColumnOptionsFiltered}
                            selectedIds={selectedOffenseColumnIds}
                            onToggle={(id) => {
                                setSelectedOffenseColumnIds((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedOffenseColumnIds([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <ColumnFilterDropdown
                            options={offensePlayerOptions}
                            selectedIds={selectedOffensePlayers}
                            onToggle={(id) => {
                                setSelectedOffensePlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedOffensePlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
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
                    {(selectedOffenseColumnIds.length > 0 || selectedOffensePlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedOffenseColumnIds([]);
                                    setSelectedOffensePlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                            >
                                Clear All
                            </button>
                            {selectedOffenseColumnIds.map((id) => {
                                const label = offenseColumnOptions.find((option) => option.id === id)?.label || id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedOffenseColumnIds((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                    >
                                        <span>{label}</span>
                                        <span className="text-gray-400">×</span>
                                    </button>
                                );
                            })}
                            {selectedOffensePlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedOffensePlayers((prev) => prev.filter((entry) => entry !== id))}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                >
                                    <span>{id}</span>
                                    <span className="text-gray-400">×</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden">
                    {filteredOffenseMetrics.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-500 italic text-sm">No offensive stats match this filter</div>
                    ) : (
                        (() => {
                            const totalSeconds = (row: any) => Math.max(1, (row.totalFightMs || 0) / 1000);
                            const totalValue = (row: any, metricId: string, metricEntry: typeof OFFENSE_METRICS[number]) => {
                                if (metricId === 'downContributionPercent') {
                                    const downContribution = row.offenseTotals?.downContribution || 0;
                                    const totalDamage = row.offenseTotals?.damage || 0;
                                    return totalDamage > 0 ? (downContribution / totalDamage) * 100 : 0;
                                }
                                if (metricEntry.isRate) {
                                    const denom = row.offenseRateWeights?.[metricId] || 0;
                                    const numer = row.offenseTotals?.[metricId] || 0;
                                    return denom > 0 ? (numer / denom) * 100 : 0;
                                }
                                return row.offenseTotals?.[metricId] || 0;
                            };
                            const formatValue = (value: number, metricEntry: typeof OFFENSE_METRICS[number]) => {
                                const decimals = roundCountStats && !metricEntry.isPercent && offenseViewMode === 'total' ? 0 : 2;
                                const formatted = formatWithCommas(value, decimals);
                                return metricEntry.isPercent ? `${formatted}%` : formatted;
                            };
                            const resolvedSortColumnId = visibleOffenseMetrics.find((entry) => entry.id === denseSort.columnId)?.id
                                || visibleOffenseMetrics[0]?.id
                                || '';
                            const rows = [...stats.offensePlayers]
                                .filter((row: any) => selectedOffensePlayers.length === 0 || selectedOffensePlayers.includes(row.account))
                                .map((row: any) => {
                                    const values: Record<string, string> = {};
                                    const numericValues: Record<string, number> = {};
                                    visibleOffenseMetrics.forEach((metricEntry) => {
                                        const total = totalValue(row, metricEntry.id, metricEntry);
                                        const value = offenseViewMode === 'total'
                                            ? total
                                            : metricEntry.isPercent || metricEntry.isRate
                                                ? total
                                                : offenseViewMode === 'per1s'
                                                    ? total / totalSeconds(row)
                                                    : (total * 60) / totalSeconds(row);
                                        numericValues[metricEntry.id] = value;
                                        values[metricEntry.id] = formatValue(value, metricEntry);
                                    });
                                    return { row, values, numericValues };
                                })
                                .sort((a, b) => {
                                    const resolvedA = a.numericValues[resolvedSortColumnId] ?? 0;
                                    const resolvedB = b.numericValues[resolvedSortColumnId] ?? 0;
                                    const primary = denseSort.dir === 'desc' ? resolvedB - resolvedA : resolvedA - resolvedB;
                                    return primary || String(a.row.account || '').localeCompare(String(b.row.account || ''));
                                });
                            return (
                                <DenseStatsTable
                                    title="Offense - Dense View"
                                    subtitle="Offensive"
                                    sortColumnId={resolvedSortColumnId}
                                    sortDirection={denseSort.dir}
                                    onSortColumn={(columnId) => {
                                        setDenseSort((prev) => ({
                                            columnId,
                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        }));
                                    }}
                                    columns={visibleOffenseMetrics.map((metricEntry) => ({
                                        id: metricEntry.id,
                                        label: metricEntry.label,
                                        align: 'right',
                                        minWidth: 90
                                    }))}
                                    rows={rows.map((entry, idx) => ({
                                        id: `${entry.row.account}-${idx}`,
                                        label: (
                                            <>
                                                <span className="text-gray-500 font-mono">{idx + 1}</span>
                                                {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                                <span className="truncate">{entry.row.account}</span>
                                            </>
                                        ),
                                        values: entry.values
                                    }))}
                                />
                            );
                        })()
                    )}
                </div>
            </div>
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
                                if (filteredOffenseMetrics.length === 0) {
                                    return <div className="text-center text-gray-500 italic py-6 text-xs">No offensive stats match this filter</div>;
                                }
                                return filteredOffenseMetrics.map((metric) => (
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
                                    const aValue = sortState.key === 'fightTime'
                                        ? Number(a.totalFightMs || 0)
                                        : Number(offenseViewMode === 'total' ? a.total : offenseViewMode === 'per1s' ? a.per1s : a.per60s);
                                    const bValue = sortState.key === 'fightTime'
                                        ? Number(b.totalFightMs || 0)
                                        : Number(offenseViewMode === 'total' ? b.total : offenseViewMode === 'per1s' ? b.per1s : b.per60s);
                                    const diff = sortState.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                    return diff || a.account.localeCompare(b.account);
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
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('value')}
                                                    className={`text-right transition-colors ${sortState.key === 'value' ? 'text-rose-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                >
                                                    {offenseViewMode === 'total' ? 'Total' : offenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                    {sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('fightTime')}
                                                    className={`text-right transition-colors ${sortState.key === 'fightTime' ? 'text-rose-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                >
                                                    Fight Time{sortState.key === 'fightTime' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
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
};
