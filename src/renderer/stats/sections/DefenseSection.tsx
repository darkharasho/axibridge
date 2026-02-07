import { useState } from 'react';
import { Maximize2, Shield, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableCard, StatsTableCardTable } from '../ui/StatsTableCard';

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
}: DefenseSectionProps) => {
    const [sortState, setSortState] = useState<{ key: 'value' | 'fightTime'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({
        columnId: DEFENSE_METRICS[0]?.id || 'value',
        dir: 'desc'
    });
    const isExpanded = expandedSection === 'defense-detailed';
    const [selectedDefenseColumnIds, setSelectedDefenseColumnIds] = useState<string[]>([]);
    const [selectedDefensePlayers, setSelectedDefensePlayers] = useState<string[]>([]);
    const filteredDefenseMetrics = DEFENSE_METRICS.filter((metric) =>
        metric.label.toLowerCase().includes(defenseSearch.trim().toLowerCase())
    );
    const defenseColumnOptions = DEFENSE_METRICS.map((metric) => ({ id: metric.id, label: metric.label }));
    const defenseColumnOptionsFiltered = defenseColumnOptions.filter((option) =>
        option.label.toLowerCase().includes(defenseSearch.trim().toLowerCase())
    );
    const selectedDefenseMetrics = selectedDefenseColumnIds.length > 0
        ? DEFENSE_METRICS.filter((metric) => selectedDefenseColumnIds.includes(metric.id))
        : DEFENSE_METRICS;
    const visibleDefenseMetrics = selectedDefenseMetrics;
    const defensePlayerOptions = Array.from(new Map(
        stats.defensePlayers.map((row: any) => [row.account, row])
    ).values()).map((row: any) => ({
        id: row.account,
        label: row.account,
        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
    }));
    const defenseSearchSelectedIds = new Set([
        ...selectedDefenseColumnIds.map((id) => `column:${id}`),
        ...selectedDefensePlayers.map((id) => `player:${id}`)
    ]);
    const updateSort = (key: 'value' | 'fightTime') => {
        setSortState((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    return (
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
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Defensive Tabs</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...defenseColumnOptions.map((option) => ({ ...option, type: 'column' as const })),
                                ...defensePlayerOptions.map((option) => ({ ...option, type: 'player' as const }))
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedDefenseColumnIds((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedDefensePlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={defenseSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <ColumnFilterDropdown
                            options={defenseColumnOptionsFiltered}
                            selectedIds={selectedDefenseColumnIds}
                            onToggle={(id) => {
                                setSelectedDefenseColumnIds((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedDefenseColumnIds([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <ColumnFilterDropdown
                            options={defensePlayerOptions}
                            selectedIds={selectedDefensePlayers}
                            onToggle={(id) => {
                                setSelectedDefensePlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedDefensePlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
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
                    {(selectedDefenseColumnIds.length > 0 || selectedDefensePlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedDefenseColumnIds([]);
                                    setSelectedDefensePlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                            >
                                Clear All
                            </button>
                            {selectedDefenseColumnIds.map((id) => {
                                const label = defenseColumnOptions.find((option) => option.id === id)?.label || id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedDefenseColumnIds((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                    >
                                        <span>{label}</span>
                                        <span className="text-gray-400">×</span>
                                    </button>
                                );
                            })}
                            {selectedDefensePlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedDefensePlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {filteredDefenseMetrics.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-500 italic text-sm">No defensive stats match this filter</div>
                    ) : (
                        (() => {
                            const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                            const formatValue = (value: number, metricEntry: typeof DEFENSE_METRICS[number]) => {
                                const isPercent = (metricEntry as any).isPercent;
                                const decimals = roundCountStats && !isPercent && defenseViewMode === 'total' ? 0 : 2;
                                const formatted = formatWithCommas(value, decimals);
                                return isPercent ? `${formatted}%` : formatted;
                            };
                            const resolvedSortColumnId = visibleDefenseMetrics.find((entry) => entry.id === denseSort.columnId)?.id
                                || visibleDefenseMetrics[0]?.id
                                || '';
                            const rows = [...stats.defensePlayers]
                                .filter((row: any) => selectedDefensePlayers.length === 0 || selectedDefensePlayers.includes(row.account))
                                .map((row: any) => {
                                    const values: Record<string, string> = {};
                                    const numericValues: Record<string, number> = {};
                                    visibleDefenseMetrics.forEach((metricEntry) => {
                                        const total = row.defenseTotals?.[metricEntry.id] || 0;
                                        const isPercent = (metricEntry as any).isPercent;
                                        const value = defenseViewMode === 'total'
                                            ? total
                                            : isPercent
                                                ? total
                                                : defenseViewMode === 'per1s'
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
                                    title="Defense - Dense View"
                                    subtitle="Defensive"
                                    sortColumnId={resolvedSortColumnId}
                                    sortDirection={denseSort.dir}
                                    onSortColumn={(columnId) => {
                                        setDenseSort((prev) => ({
                                            columnId,
                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        }));
                                    }}
                                    columns={visibleDefenseMetrics.map((metricEntry) => ({
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
            <StatsTableCard
                expanded={expandedSection === 'defense-detailed'}
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
                                if (filteredDefenseMetrics.length === 0) {
                                    return <div className="text-center text-gray-500 italic py-6 text-xs">No defensive stats match this filter</div>;
                                }
                                return filteredDefenseMetrics.map((metric) => (
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
                                    const aValue = sortState.key === 'fightTime'
                                        ? Number(a.activeMs || 0)
                                        : Number(defenseViewMode === 'total' ? a.total : defenseViewMode === 'per1s' ? a.per1s : a.per60s);
                                    const bValue = sortState.key === 'fightTime'
                                        ? Number(b.activeMs || 0)
                                        : Number(defenseViewMode === 'total' ? b.total : defenseViewMode === 'per1s' ? b.per1s : b.per60s);
                                    const diff = sortState.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                    return diff || a.account.localeCompare(b.account);
                                });

                            return (
                                <StatsTableCardTable
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
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('value')}
                                                    className={`text-right transition-colors ${sortState.key === 'value' ? 'text-sky-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                >
                                                    {defenseViewMode === 'total' ? 'Total' : defenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                    {sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('fightTime')}
                                                    className={`text-right transition-colors ${sortState.key === 'fightTime' ? 'text-sky-200' : 'text-gray-400 hover:text-gray-200'}`}
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
};
