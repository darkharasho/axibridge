import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { Maximize2, X, Columns, Users, Swords } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { OFFENSE_METRICS } from '../statsMetrics';

type OffenseSectionProps = {
    offenseSearch: string;
    setOffenseSearch: (value: string) => void;
    activeOffenseStat: string;
    setActiveOffenseStat: (value: string) => void;
    offenseViewMode: 'total' | 'per1s' | 'per60s';
    setOffenseViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
};

export const OffenseSection = ({
    offenseSearch,
    setOffenseSearch,
    activeOffenseStat,
    setActiveOffenseStat,
    offenseViewMode,
    setOffenseViewMode
}: OffenseSectionProps) => {
    const { stats, roundCountStats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const {
        sortState, updateSort,
        denseSort, setDenseSort,
        selectedColumnIds: selectedOffenseColumnIds, setSelectedColumnIds: setSelectedOffenseColumnIds,
        selectedPlayers: selectedOffensePlayers, setSelectedPlayers: setSelectedOffensePlayers,
        filteredMetrics: filteredOffenseMetrics,
        columnOptions: offenseColumnOptions,
        columnOptionsFiltered: offenseColumnOptionsFiltered,
        selectedMetrics: visibleOffenseMetrics,
        playerOptions: offensePlayerOptions,
        searchSelectedIds: offenseSearchSelectedIds,
    } = useMetricSectionState({
        metrics: OFFENSE_METRICS,
        rows: stats.offensePlayers,
        search: offenseSearch,
        renderProfessionIcon,
    });
    const isExpanded = expandedSection === 'offense-detailed';
    return (
    <div
        className={`stats-share-exclude ${
            expandedSection === 'offense-detailed'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`}
        style={expandedSection === 'offense-detailed' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
    >
        <div className="flex items-center gap-2 mb-3.5">
            <Swords className="w-4 h-4 shrink-0" style={{ color: 'var(--section-offense)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                Offense Detailed
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'offense-detailed' ? closeExpandedSection() : openExpandedSection('offense-detailed'))}
                className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                aria-label={expandedSection === 'offense-detailed' ? 'Close Offense Detailed' : 'Expand Offense Detailed'}
                title={expandedSection === 'offense-detailed' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'offense-detailed' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
            </button>
        </div>
        {stats.offensePlayers.length === 0 ? (
            <div className="text-center italic py-8" style={{ color: 'var(--text-muted)' }}>No offensive stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Offensive Tabs</div>
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
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
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
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
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
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                    >
                                        <span>{label}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                    </button>
                                );
                            })}
                            {selectedOffensePlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedOffensePlayers((prev) => prev.filter((entry) => entry !== id))}
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                    style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                >
                                    <span>{id}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="overflow-hidden">
                    {filteredOffenseMetrics.length === 0 ? (
                        <div className="px-4 py-10 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>No offensive stats match this filter</div>
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
                                                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
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
            <>
            <div className="flex items-center gap-2 mb-2">
                <PillToggleGroup
                    value={offenseViewMode}
                    onChange={setOffenseViewMode}
                    options={[
                        { value: 'total', label: 'Total' },
                        { value: 'per1s', label: 'Stat/1s' },
                        { value: 'per60s', label: 'Stat/60s' }
                    ]}
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-[color:var(--text-secondary)]"
                />
            </div>
            <StatsTableLayout
                expanded={expandedSection === 'offense-detailed'}
                sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${expandedSection === 'offense-detailed' ? 'h-full flex-1' : ''}`}
                sidebarStyle={undefined}
                contentClassName={`overflow-hidden ${expandedSection === 'offense-detailed' ? 'flex flex-col min-h-0' : ''}`}
                contentStyle={undefined}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Offensive Tabs</div>
                        <input
                            value={offenseSearch}
                            onChange={(e) => setOffenseSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs focus:outline-none mb-2"
                            style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'offense-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredOffenseMetrics.length === 0) {
                                    return <div className="text-center italic py-6 text-xs" style={{ color: 'var(--text-muted)' }}>No offensive stats match this filter</div>;
                                }
                                return filteredOffenseMetrics.map((metric) => (
                                    <button
                                        key={metric.id}
                                        onClick={() => setActiveOffenseStat(metric.id)}
                                        className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeOffenseStat === metric.id
                                            ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                            : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                        style={activeOffenseStat !== metric.id ? { color: 'var(--text-secondary)' } : undefined}
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
                                    header={null}
                                    columns={
                                        <>
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider px-4 py-2" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('value')}
                                                    className="text-right transition-colors"
                                                    style={{ color: sortState.key === 'value' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                >
                                                    {offenseViewMode === 'total' ? 'Total' : offenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                    {sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('fightTime')}
                                                    className="text-right transition-colors"
                                                    style={{ color: sortState.key === 'fightTime' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                >
                                                    Fight Time{sortState.key === 'fightTime' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
                                            </div>
                                        </>
                                    }
                                    rows={
                                        <>
                                            {rows.map((row: any, idx: number) => (
                                                <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm border-t" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}>
                                                    <div className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</div>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                        <span className="truncate">{row.account}</span>
                                                    </div>
                                                    <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                        {(() => {
                                                            const value = offenseViewMode === 'total'
                                                                ? row.total
                                                                : offenseViewMode === 'per1s'
                                                                    ? row.per1s
                                                                    : row.per60s;
                                                            return formatValue(value);
                                                        })()}
                                                    </div>
                                                    <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
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
            </>
        )}
    </div>
    );
};
