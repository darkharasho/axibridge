import { useState } from 'react';
import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { Maximize2, X, Columns, Users, Shield } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { DEFENSE_METRICS } from '../statsMetrics';

type DefenseSectionProps = {
    defenseSearch: string;
    setDefenseSearch: (value: string) => void;
    activeDefenseStat: string;
    setActiveDefenseStat: (value: string) => void;
    defenseViewMode: 'total' | 'per1s' | 'per60s';
    setDefenseViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
};

export const DefenseSection = ({
    defenseSearch,
    setDefenseSearch,
    activeDefenseStat,
    setActiveDefenseStat,
    defenseViewMode,
    setDefenseViewMode
}: DefenseSectionProps) => {
    const { stats, roundCountStats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const {
        sortState, updateSort,
        denseSort, setDenseSort,
        selectedColumnIds: selectedDefenseColumnIds, setSelectedColumnIds: setSelectedDefenseColumnIds,
        selectedPlayers: selectedDefensePlayers, setSelectedPlayers: setSelectedDefensePlayers,
        filteredMetrics: filteredDefenseMetrics,
        columnOptions: defenseColumnOptions,
        columnOptionsFiltered: defenseColumnOptionsFiltered,
        selectedMetrics: visibleDefenseMetrics,
        playerOptions: defensePlayerOptions,
        searchSelectedIds: defenseSearchSelectedIds,
    } = useMetricSectionState({
        metrics: DEFENSE_METRICS,
        rows: stats.defensePlayers,
        search: defenseSearch,
        renderProfessionIcon,
    });
    const [minionDamageMode, setMinionDamageMode] = useState<'combined' | 'separate'>('combined');
    const isExpanded = expandedSection === 'defense-detailed';
    const isMinionDamageMetric = (id?: string) => id === 'minionDamageTaken';
    const getMinionRows = (rows: any[], mode: 'combined' | 'separate') => {
        if (mode === 'combined') {
            return rows.map((row: any) => ({
                ...row,
                minionList: Object.entries(row?.minionDamageTakenByMinion || {})
                    .filter(([, value]) => Number(value || 0) > 0)
                    .sort((a: any, b: any) => Number(b[1] || 0) - Number(a[1] || 0))
                    .map(([name]) => String(name))
            }));
        }
        return rows.flatMap((row: any) => {
            const entries = Object.entries(row?.minionDamageTakenByMinion || {})
                .filter(([, value]) => Number(value || 0) > 0)
                .sort((a: any, b: any) => Number(b[1] || 0) - Number(a[1] || 0));
            if (entries.length === 0) return [];
            return entries.map(([minionName, damage]) => ({
                ...row,
                minionName: String(minionName),
                defenseTotals: { ...(row.defenseTotals || {}), minionDamageTaken: Number(damage || 0) }
            }));
        });
    };
    return (
    <div
        className={`stats-share-exclude ${
            expandedSection === 'defense-detailed'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`}
        style={expandedSection === 'defense-detailed' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
    >
        <div className="flex items-center gap-2 mb-3.5">
            <Shield className="w-4 h-4 shrink-0" style={{ color: 'var(--section-defense)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                Defense Detailed
            </h3>
            <div className="ml-auto flex items-center gap-2">
                {!isExpanded && isMinionDamageMetric(activeDefenseStat) && (
                    <PillToggleGroup
                        value={minionDamageMode}
                        onChange={(value) => setMinionDamageMode(value as 'combined' | 'separate')}
                        options={[
                            { value: 'combined', label: 'Combined' },
                            { value: 'separate', label: 'Separate' }
                        ]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                )}
                {!isExpanded && (
                    <PillToggleGroup
                        value={defenseViewMode}
                        onChange={setDefenseViewMode}
                        options={[
                            { value: 'total', label: 'Total' },
                            { value: 'per1s', label: 'Stat/1s' },
                            { value: 'per60s', label: 'Stat/60s' }
                        ]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                )}
                <button
                    type="button"
                    onClick={() => (expandedSection === 'defense-detailed' ? closeExpandedSection() : openExpandedSection('defense-detailed'))}
                    className="flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={expandedSection === 'defense-detailed' ? 'Close Defense Detailed' : 'Expand Defense Detailed'}
                    title={expandedSection === 'defense-detailed' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'defense-detailed' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
        </div>
        {stats.defensePlayers.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No defensive stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Defensive Tabs</div>
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
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                        {visibleDefenseMetrics.some((metric) => isMinionDamageMetric(metric.id)) && (
                            <PillToggleGroup
                                value={minionDamageMode}
                                onChange={(value) => setMinionDamageMode(value as 'combined' | 'separate')}
                                options={[
                                    { value: 'combined', label: 'Combined' },
                                    { value: 'separate', label: 'Separate' }
                                ]}
                                activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                inactiveClassName="text-[color:var(--text-secondary)]"
                            />
                        )}
                    </div>
                    {(selectedDefenseColumnIds.length > 0 || selectedDefensePlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedDefenseColumnIds([]);
                                    setSelectedDefensePlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
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
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                    >
                                        <span>{label}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                    </button>
                                );
                            })}
                            {selectedDefensePlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedDefensePlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {filteredDefenseMetrics.length === 0 ? (
                        <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No defensive stats match this filter</div>
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
                            const sourceRows = [...stats.defensePlayers]
                                .filter((row: any) => selectedDefensePlayers.length === 0 || selectedDefensePlayers.includes(row.account));
                            const effectiveRows = visibleDefenseMetrics.some((metric) => isMinionDamageMetric(metric.id))
                                ? getMinionRows(sourceRows, minionDamageMode)
                                : sourceRows;
                            const rows = [...effectiveRows]
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
                                                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                                                {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                                <span className="min-w-0 flex flex-col">
                                                    <span className="truncate">{entry.row.account}</span>
                                                    {minionDamageMode === 'combined' && Array.isArray(entry.row.minionList) && entry.row.minionList.length > 0 && (
                                                        <span className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                                            {entry.row.minionList.join(', ')}
                                                        </span>
                                                    )}
                                                    {minionDamageMode === 'separate' && entry.row.minionName && (
                                                        <span className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                                            {entry.row.minionName}
                                                        </span>
                                                    )}
                                                </span>
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
            <StatsTableLayout
                expanded={expandedSection === 'defense-detailed'}
                sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${expandedSection === 'defense-detailed' ? 'h-full flex-1' : ''}`}
                sidebarStyle={undefined}
                contentClassName={`overflow-hidden ${expandedSection === 'defense-detailed' ? 'flex flex-col min-h-0' : ''}`}
                contentStyle={undefined}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Defensive Tabs</div>
                        <input
                            value={defenseSearch}
                            onChange={(e) => setDefenseSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs focus:outline-none mb-2"
                            style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'defense-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredDefenseMetrics.length === 0) {
                                    return <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No defensive stats match this filter</div>;
                                }
                                return filteredDefenseMetrics.map((metric) => (
                                    <button
                                        key={metric.id}
                                        onClick={() => setActiveDefenseStat(metric.id)}
                                        className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeDefenseStat === metric.id
                                            ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                            : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                        style={activeDefenseStat !== metric.id ? { color: 'var(--text-secondary)' } : undefined}
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
                            const sourceRows = [...stats.defensePlayers];
                            const effectiveRows = isMinionDamageMetric(metric.id)
                                ? getMinionRows(sourceRows, minionDamageMode)
                                : sourceRows;
                            const rows = [...effectiveRows]
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
                                <StatsTableShell
                                    expanded={expandedSection === 'defense-detailed'}
                                    header={null}
                                    columns={
                                        <>
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-4 py-2 border-b border-[color:var(--border-default)]">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('value')}
                                                    className="text-right transition-colors"
                                                    style={{ color: sortState.key === 'value' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                >
                                                    {defenseViewMode === 'total' ? 'Total' : defenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
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
                                                <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-3 text-sm border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-primary)' }}>
                                                    <div className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</div>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                        <span className="min-w-0 flex flex-col">
                                                            <span className="truncate">{row.account}</span>
                                                            {isMinionDamageMetric(metric.id) && minionDamageMode === 'combined' && Array.isArray(row.minionList) && row.minionList.length > 0 && (
                                                                <span className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>{row.minionList.join(', ')}</span>
                                                            )}
                                                            {isMinionDamageMetric(metric.id) && minionDamageMode === 'separate' && row.minionName && (
                                                                <span className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>{row.minionName}</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
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
                                                    <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
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
            </>
        )}
    </div>
    );
};
