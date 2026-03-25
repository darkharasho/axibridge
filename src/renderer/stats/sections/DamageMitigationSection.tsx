import { useState } from 'react';
import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { Maximize2, X, Columns, Users } from 'lucide-react';
import { Gw2DamMitIcon } from '../../ui/Gw2DamMitIcon';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { DAMAGE_MITIGATION_METRICS } from '../statsMetrics';

type DamageMitigationSectionProps = {
    damageMitigationSearch: string;
    setDamageMitigationSearch: (value: string) => void;
    activeDamageMitigationStat: string;
    setActiveDamageMitigationStat: (value: string) => void;
    damageMitigationViewMode: 'total' | 'per1s' | 'per60s';
    setDamageMitigationViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    damageMitigationScope: 'player' | 'minions';
    setDamageMitigationScope: (value: 'player' | 'minions') => void;
};

export const DamageMitigationSection = ({
    damageMitigationSearch,
    setDamageMitigationSearch,
    activeDamageMitigationStat,
    setActiveDamageMitigationStat,
    damageMitigationViewMode,
    setDamageMitigationViewMode,
    damageMitigationScope,
    setDamageMitigationScope
}: DamageMitigationSectionProps) => {
    const { stats, roundCountStats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const mitigationPlayers = stats.damageMitigationPlayers || [];
    const mitigationMinions = stats.damageMitigationMinions || [];
    const mitigationRows = damageMitigationScope === 'minions' ? mitigationMinions : mitigationPlayers;
    const hasMitigationData = mitigationPlayers.length > 0 || mitigationMinions.length > 0;
    const [selectedMinionTypes, setSelectedMinionTypes] = useState<string[]>([]);
    const {
        sortState, updateSort,
        denseSort, setDenseSort,
        selectedColumnIds: selectedMitigationColumnIds, setSelectedColumnIds: setSelectedMitigationColumnIds,
        selectedPlayers: selectedMitigationPlayers, setSelectedPlayers: setSelectedMitigationPlayers,
        filteredMetrics: filteredMitigationMetrics,
        columnOptions: mitigationColumnOptions,
        columnOptionsFiltered: mitigationColumnOptionsFiltered,
        selectedMetrics: visibleMitigationMetrics,
        playerOptions: mitigationPlayerOptions,
        searchSelectedIds: mitigationSearchSelectedIds,
    } = useMetricSectionState({
        metrics: DAMAGE_MITIGATION_METRICS,
        rows: mitigationRows,
        search: damageMitigationSearch,
        initialDenseSortColumnId: 'totalMitigation',
        renderProfessionIcon,
    });
    const isExpanded = expandedSection === 'defense-mitigation';
    const mitigationMinionOptions = Array.from(new Map(
        mitigationMinions.map((row: any) => [row.minion, row])
    ).values())
        .filter((row: any) => row?.minion)
        .map((row: any) => ({
            id: String(row.minion),
            label: String(row.minion)
        }));
    const formatValue = (value: number) => {
        const decimals = roundCountStats && damageMitigationViewMode === 'total' ? 0 : 2;
        return formatWithCommas(value, decimals);
    };

    return (
        <div
            className={`stats-share-exclude ${
                expandedSection === 'defense-mitigation'
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`}
            style={expandedSection === 'defense-mitigation' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-2">
                <span className="flex shrink-0" style={{ color: 'var(--section-mitigation)' }}><Gw2DamMitIcon className="w-4 h-4" /></span>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                    Defense Mitigation
                </h3>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'defense-mitigation' ? closeExpandedSection() : openExpandedSection('defense-mitigation'))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={expandedSection === 'defense-mitigation' ? 'Close Damage Mitigation' : 'Expand Damage Mitigation'}
                    title={expandedSection === 'defense-mitigation' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'defense-mitigation' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
            <div className="text-xs text-amber-200/80 italic mb-3">
                Damage mitigation is an estimate based on enemy skill damage averages and avoidance events (block/evade/miss/invuln/interrupted). Use it for relative comparison rather than exact prevention totals.
            </div>
            {!hasMitigationData ? (
                <div className="text-center italic py-8" style={{ color: 'var(--text-muted)' }}>No damage mitigation stats available</div>
            ) : isExpanded ? (
                <div className="flex flex-col gap-4">
                    <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Mitigation Tabs</div>
                        <div className="flex flex-wrap items-center gap-2">
                            <SearchSelectDropdown
                                options={[
                                    ...mitigationColumnOptions.map((option) => ({ ...option, type: 'column' as const })),
                                    ...mitigationPlayerOptions.map((option) => ({ ...option, type: 'player' as const }))
                                ]}
                                onSelect={(option: SearchSelectOption) => {
                                    if (option.type === 'column') {
                                        setSelectedMitigationColumnIds((prev) =>
                                            prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                        );
                                    } else {
                                        setSelectedMitigationPlayers((prev) =>
                                            prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                        );
                                    }
                                }}
                                selectedIds={mitigationSearchSelectedIds}
                                className="w-full sm:w-64"
                            />
                            <ColumnFilterDropdown
                                options={mitigationColumnOptionsFiltered}
                                selectedIds={selectedMitigationColumnIds}
                                onToggle={(id) => {
                                    setSelectedMitigationColumnIds((prev) =>
                                        prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                    );
                                }}
                                onClear={() => setSelectedMitigationColumnIds([])}
                                buttonIcon={<Columns className="h-3.5 w-3.5" />}
                            />
                            <ColumnFilterDropdown
                                options={mitigationPlayerOptions}
                                selectedIds={selectedMitigationPlayers}
                                onToggle={(id) => {
                                    setSelectedMitigationPlayers((prev) =>
                                        prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                    );
                                }}
                                onClear={() => setSelectedMitigationPlayers([])}
                                buttonLabel="Players"
                                buttonIcon={<Users className="h-3.5 w-3.5" />}
                            />
                            {damageMitigationScope === 'minions' && (
                                <ColumnFilterDropdown
                                    options={mitigationMinionOptions}
                                    selectedIds={selectedMinionTypes}
                                    onToggle={(id) => {
                                        setSelectedMinionTypes((prev) =>
                                            prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                        );
                                    }}
                                    onClear={() => setSelectedMinionTypes([])}
                                    buttonLabel="Minions"
                                />
                            )}
                            <PillToggleGroup
                                value={damageMitigationScope}
                                onChange={setDamageMitigationScope}
                                options={[
                                    { value: 'player', label: 'Player' },
                                    { value: 'minions', label: 'Minions' }
                                ]}
                                activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                inactiveClassName="text-[color:var(--text-secondary)]"
                            />
                            <PillToggleGroup
                                value={damageMitigationViewMode}
                                onChange={setDamageMitigationViewMode}
                                options={[
                                    { value: 'total', label: 'Total' },
                                    { value: 'per1s', label: 'Stat/1s' },
                                    { value: 'per60s', label: 'Stat/60s' }
                                ]}
                                activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                inactiveClassName="text-[color:var(--text-secondary)]"
                            />
                        </div>
                        {(selectedMitigationColumnIds.length > 0 || selectedMitigationPlayers.length > 0) && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedMitigationColumnIds([]);
                                        setSelectedMitigationPlayers([]);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                    style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                >
                                    Clear All
                                </button>
                                {selectedMitigationColumnIds.map((id) => {
                                    const label = mitigationColumnOptions.find((option) => option.id === id)?.label || id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setSelectedMitigationColumnIds((prev) => prev.filter((entry) => entry !== id))}
                                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                            style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                        >
                                            <span>{label}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                        </button>
                                    );
                                })}
                                {selectedMitigationPlayers.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedMitigationPlayers((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                    >
                                        <span>{id}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {damageMitigationScope === 'minions' && selectedMinionTypes.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedMinionTypes([])}
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                    style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                >
                                    Clear Minions
                                </button>
                                {selectedMinionTypes.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedMinionTypes((prev) => prev.filter((entry) => entry !== id))}
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
                        {mitigationRows.length === 0 ? (
                            <div className="px-4 py-10 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>
                                No {damageMitigationScope === 'minions' ? 'minion' : 'player'} mitigation stats available
                            </div>
                        ) : filteredMitigationMetrics.length === 0 ? (
                            <div className="px-4 py-10 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>No mitigation stats match this filter</div>
                        ) : (
                            (() => {
                                const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                                const resolvedSortColumnId = visibleMitigationMetrics.find((entry) => entry.id === denseSort.columnId)?.id
                                    || visibleMitigationMetrics[0]?.id
                                    || '';
                            const rows = [...mitigationRows]
                                .filter((row: any) => selectedMitigationPlayers.length === 0 || selectedMitigationPlayers.includes(row.account))
                                .filter((row: any) => {
                                    if (damageMitigationScope !== 'minions') return true;
                                    if (!selectedMinionTypes.length) return true;
                                    return selectedMinionTypes.includes(String(row.minion || ''));
                                })
                                .map((row: any) => {
                                    const values: Record<string, string> = {};
                                    const numericValues: Record<string, number> = {};
                                        visibleMitigationMetrics.forEach((metricEntry) => {
                                            const total = row.mitigationTotals?.[metricEntry.id] || 0;
                                            const value = damageMitigationViewMode === 'total'
                                                ? total
                                                : damageMitigationViewMode === 'per1s'
                                                    ? total / totalSeconds(row)
                                                    : (total * 60) / totalSeconds(row);
                                            numericValues[metricEntry.id] = value;
                                            values[metricEntry.id] = formatValue(value);
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
                                        title="Damage Mitigation - Dense View"
                                        subtitle="Defensive"
                                        sortColumnId={resolvedSortColumnId}
                                        sortDirection={denseSort.dir}
                                        onSortColumn={(columnId) => {
                                            setDenseSort((prev) => ({
                                                columnId,
                                                dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                            }));
                                        }}
                                        columns={visibleMitigationMetrics.map((metricEntry) => ({
                                            id: metricEntry.id,
                                            label: metricEntry.label,
                                            align: 'right',
                                            minWidth: 90
                                        }))}
                                        rows={rows.map((entry, idx) => (
                                            {
                                                id: `${entry.row.account}-${entry.row.minion || 'player'}-${idx}`,
                                                label: (
                                                    <>
                                                        <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                                                        {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                                        <div className="min-w-0">
                                                            <div className="truncate">{entry.row.account}</div>
                                                            {entry.row.minion && (
                                                                <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{entry.row.minion}</div>
                                                            )}
                                                        </div>
                                                    </>
                                                ),
                                                values: entry.values
                                            }
                                        ))}
                                    />
                                );
                            })()
                        )}
                    </div>
                </div>
            ) : (
                <StatsTableLayout
                    expanded={expandedSection === 'defense-mitigation'}
                    sidebarClassName={`px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'defense-mitigation' ? 'h-full flex-1' : 'self-start'}`}
                    sidebarStyle={undefined}
                    contentClassName={`overflow-hidden ${expandedSection === 'defense-mitigation' ? 'flex flex-col min-h-0' : ''}`}
                    contentStyle={undefined}
                    sidebar={
                        <>
                            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Mitigation Tabs</div>
                            <input
                                value={damageMitigationSearch}
                                onChange={(e) => setDamageMitigationSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full px-2 py-1 text-xs focus:outline-none mb-2 mt-2"
                                style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                            />
                            <div className={`${sidebarListClass} ${expandedSection === 'defense-mitigation' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                {(() => {
                                    if (filteredMitigationMetrics.length === 0) {
                                        return <div className="text-center italic py-6 text-xs" style={{ color: 'var(--text-muted)' }}>No mitigation stats match this filter</div>;
                                    }
                                    return filteredMitigationMetrics.map((metric) => (
                                        <button
                                            key={metric.id}
                                            onClick={() => setActiveDamageMitigationStat(metric.id)}
                                            className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeDamageMitigationStat === metric.id
                                                ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                                : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                                }`}
                                            style={activeDamageMitigationStat !== metric.id ? { color: 'var(--text-secondary)' } : undefined}
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
                                const metric = DAMAGE_MITIGATION_METRICS.find((entry) => entry.id === activeDamageMitigationStat)
                                    || DAMAGE_MITIGATION_METRICS[0];
                                const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                                const rows = [...mitigationRows]
                                    .map((row: any) => ({
                                        ...row,
                                        total: row.mitigationTotals?.[metric.id] || 0,
                                        per1s: (row.mitigationTotals?.[metric.id] || 0) / totalSeconds(row),
                                        per60s: ((row.mitigationTotals?.[metric.id] || 0) * 60) / totalSeconds(row)
                                    }))
                                    .filter((row: any) => {
                                        if (damageMitigationScope !== 'minions') return true;
                                        if (!selectedMinionTypes.length) return true;
                                        return selectedMinionTypes.includes(String(row.minion || ''));
                                    })
                                    .sort((a, b) => {
                                        const aValue = sortState.key === 'fightTime'
                                            ? Number(a.activeMs || 0)
                                            : Number(damageMitigationViewMode === 'total' ? a.total : damageMitigationViewMode === 'per1s' ? a.per1s : a.per60s);
                                        const bValue = sortState.key === 'fightTime'
                                            ? Number(b.activeMs || 0)
                                            : Number(damageMitigationViewMode === 'total' ? b.total : damageMitigationViewMode === 'per1s' ? b.per1s : b.per60s);
                                        const diff = sortState.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                        return diff || a.account.localeCompare(b.account);
                                    });

                                return (
                                    <StatsTableShell
                                        expanded={expandedSection === 'defense-mitigation'}
                                        header={
                                            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--bg-hover)' }}>
                                                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{metric.label}</div>
                                                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Mitigation</div>
                                            </div>
                                        }
                                        columns={
                                            <>
                                                <div className="px-4 py-2" style={{ background: 'var(--bg-hover)' }}>
                                                    <div className="flex items-center gap-2">
                                                        <PillToggleGroup
                                                            value={damageMitigationScope}
                                                            onChange={setDamageMitigationScope}
                                                            options={[
                                                                { value: 'player', label: 'Player' },
                                                                { value: 'minions', label: 'Minions' }
                                                            ]}
                                                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                                            inactiveClassName="text-[color:var(--text-secondary)]"
                                                        />
                                                        <div className="ml-auto">
                                                            <PillToggleGroup
                                                                value={damageMitigationViewMode}
                                                                onChange={setDamageMitigationViewMode}
                                                                options={[
                                                                    { value: 'total', label: 'Total' },
                                                                    { value: 'per1s', label: 'Stat/1s' },
                                                                    { value: 'per60s', label: 'Stat/60s' }
                                                                ]}
                                                                activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                                                inactiveClassName="text-[color:var(--text-secondary)]"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-[0.4fr_1.6fr_1fr_0.9fr] text-xs uppercase tracking-wider px-4 py-2" style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}>
                                                    <div className="text-center">#</div>
                                                    <div>Player</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateSort('value')}
                                                        className="text-right transition-colors"
                                                        style={{ color: sortState.key === 'value' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                    >
                                                        {damageMitigationViewMode === 'total' ? 'Total' : damageMitigationViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
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
                                            rows.length === 0 ? (
                                                <div className="px-4 py-10 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>
                                                    No {damageMitigationScope === 'minions' ? 'minion' : 'player'} mitigation stats available
                                                </div>
                                            ) : (
                                                <>
                                                    {rows.map((row: any, idx: number) => (
                                                        <div key={`${metric.id}-${row.account}-${row.minion || 'player'}-${idx}`} className="grid grid-cols-[0.4fr_1.6fr_1fr_0.9fr] px-4 py-2 text-sm border-t" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}>
                                                            <div className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</div>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                <div className="min-w-0">
                                                                    <div className="truncate">{row.account}</div>
                                                                    {row.minion && <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{row.minion}</div>}
                                                                </div>
                                                            </div>
                                                            <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                {(() => {
                                                                    const value = damageMitigationViewMode === 'total'
                                                                        ? row.total
                                                                        : damageMitigationViewMode === 'per1s'
                                                                            ? row.per1s
                                                                            : row.per60s;
                                                                    return formatValue(value);
                                                                })()}
                                                            </div>
                                                            <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                {row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </>
                                            )
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
