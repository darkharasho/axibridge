import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { Maximize2, X, Columns, Users } from 'lucide-react';
import { SupportPlusIcon } from '../../ui/SupportPlusIcon';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { SUPPORT_METRICS } from '../statsMetrics';

type SupportSectionProps = {
    supportSearch: string;
    setSupportSearch: (value: string) => void;
    activeSupportStat: string;
    setActiveSupportStat: (value: string) => void;
    supportViewMode: 'total' | 'per1s' | 'per60s';
    setSupportViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    cleanseScope: 'all' | 'squad';
    setCleanseScope: (value: 'all' | 'squad') => void;
};

export const SupportSection = ({
    supportSearch,
    setSupportSearch,
    activeSupportStat,
    setActiveSupportStat,
    supportViewMode,
    setSupportViewMode,
    cleanseScope,
    setCleanseScope
}: SupportSectionProps) => {
    const { stats, roundCountStats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const {
        sortState, updateSort,
        denseSort, setDenseSort,
        selectedColumnIds: selectedSupportColumnIds, setSelectedColumnIds: setSelectedSupportColumnIds,
        selectedPlayers: selectedSupportPlayers, setSelectedPlayers: setSelectedSupportPlayers,
        filteredMetrics: filteredSupportMetrics,
        columnOptions: supportColumnOptions,
        columnOptionsFiltered: supportColumnOptionsFiltered,
        selectedMetrics: visibleSupportColumns,
        playerOptions: supportPlayerOptions,
        searchSelectedIds: supportSearchSelectedIds,
    } = useMetricSectionState({
        metrics: SUPPORT_METRICS,
        rows: stats.supportPlayers,
        search: supportSearch,
        renderProfessionIcon,
    });
    const isExpanded = expandedSection === 'support-detailed';
    return (
    <div
        className={`stats-share-exclude ${
            expandedSection === 'support-detailed'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`}
        style={expandedSection === 'support-detailed' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
    >
        <div className="flex items-center gap-2 mb-3.5">
            <span className="flex shrink-0" style={{ color: 'var(--section-support)' }}><SupportPlusIcon className="w-4 h-4" /></span>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                Support Detailed
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'support-detailed' ? closeExpandedSection() : openExpandedSection('support-detailed'))}
                className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                aria-label={expandedSection === 'support-detailed' ? 'Close Support Detailed' : 'Expand Support Detailed'}
                title={expandedSection === 'support-detailed' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'support-detailed' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
            </button>
        </div>
        {stats.supportPlayers.length === 0 ? (
            <div className="text-center italic py-8" style={{ color: 'var(--text-muted)' }}>No support stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Support Tabs</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...supportColumnOptions.map((option) => ({ ...option, type: 'column' as const })),
                                ...supportPlayerOptions.map((option) => ({ ...option, type: 'player' as const }))
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedSupportColumnIds((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedSupportPlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={supportSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <ColumnFilterDropdown
                            options={supportColumnOptionsFiltered}
                            selectedIds={selectedSupportColumnIds}
                            onToggle={(id) => {
                                setSelectedSupportColumnIds((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedSupportColumnIds([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <ColumnFilterDropdown
                            options={supportPlayerOptions}
                            selectedIds={selectedSupportPlayers}
                            onToggle={(id) => {
                                setSelectedSupportPlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedSupportPlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
                        <PillToggleGroup
                            value={supportViewMode}
                            onChange={setSupportViewMode}
                            options={[
                                { value: 'total', label: 'Total' },
                                { value: 'per1s', label: 'Stat/1s' },
                                { value: 'per60s', label: 'Stat/60s' }
                            ]}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                        {activeSupportStat === 'condiCleanse' && (
                            <PillToggleGroup
                                value={cleanseScope}
                                onChange={setCleanseScope}
                                options={[
                                    { value: 'all', label: 'All' },
                                    { value: 'squad', label: 'Squad' }
                                ]}
                                activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                inactiveClassName="text-[color:var(--text-secondary)]"
                            />
                        )}
                    </div>
                    {(selectedSupportColumnIds.length > 0 || selectedSupportPlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedSupportColumnIds([]);
                                    setSelectedSupportPlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                            >
                                Clear All
                            </button>
                            {selectedSupportColumnIds.map((id) => {
                                const label = supportColumnOptions.find((option) => option.id === id)?.label || id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedSupportColumnIds((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                    >
                                        <span>{label}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                    </button>
                                );
                            })}
                            {selectedSupportPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedSupportPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {filteredSupportMetrics.length === 0 ? (
                        <div className="px-4 py-10 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>No support stats match this filter</div>
                    ) : (
                        (() => {
                            const resolveSupportTotal = (row: any, metricId: string) => {
                                if (metricId === 'condiCleanse') {
                                    const squad = row.supportTotals?.condiCleanse || 0;
                                    const self = row.supportTotals?.condiCleanseSelf || 0;
                                    return cleanseScope === 'all' ? squad + self : squad;
                                }
                                return row.supportTotals?.[metricId] || 0;
                            };
                            const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                            const formatValue = (metric: { id: string; isTime?: boolean }, value: number) => {
                                const decimals = metric.isTime
                                    ? 1
                                    : (roundCountStats && supportViewMode === 'total' ? 0 : 2);
                                return formatWithCommas(value, decimals);
                            };
                            const resolvedSortColumnId = visibleSupportColumns.find((metric) => metric.id === denseSort.columnId)?.id
                                || visibleSupportColumns[0]?.id
                                || '';
                            const rows = [...stats.supportPlayers]
                                .filter((row: any) => selectedSupportPlayers.length === 0 || selectedSupportPlayers.includes(row.account))
                                .map((row: any) => {
                                    const values: Record<string, string> = {};
                                    const numericValues: Record<string, number> = {};
                                    visibleSupportColumns.forEach((metric) => {
                                        const total = resolveSupportTotal(row, metric.id);
                                        const value = supportViewMode === 'total'
                                            ? total
                                            : supportViewMode === 'per1s'
                                                ? total / totalSeconds(row)
                                                : (total * 60) / totalSeconds(row);
                                        numericValues[metric.id] = value;
                                        values[metric.id] = formatValue(metric, value);
                                    });
                                    return {
                                        row,
                                        values,
                                        numericValues
                                    };
                                })
                                .sort((a, b) => {
                                    const resolvedA = a.numericValues[resolvedSortColumnId] ?? 0;
                                    const resolvedB = b.numericValues[resolvedSortColumnId] ?? 0;
                                    const primary = denseSort.dir === 'desc' ? resolvedB - resolvedA : resolvedA - resolvedB;
                                    return primary || String(a.row.account || '').localeCompare(String(b.row.account || ''));
                                });
                            return (
                                <DenseStatsTable
                                    title="Support - Dense View"
                                    subtitle="Support"
                                    sortColumnId={resolvedSortColumnId}
                                    sortDirection={denseSort.dir}
                                    onSortColumn={(columnId) => {
                                        setDenseSort((prev) => ({
                                            columnId,
                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        }));
                                    }}
                                    columns={visibleSupportColumns.map((metric) => ({
                                        id: metric.id,
                                        label: metric.label,
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
                {activeSupportStat === 'condiCleanse' && (
                    <PillToggleGroup
                        value={cleanseScope}
                        onChange={setCleanseScope}
                        options={[
                            { value: 'all', label: 'All' },
                            { value: 'squad', label: 'Squad' }
                        ]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                )}
                <PillToggleGroup
                    value={supportViewMode}
                    onChange={setSupportViewMode}
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
                expanded={expandedSection === 'support-detailed'}
                sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${expandedSection === 'support-detailed' ? 'h-full flex-1' : ''}`}
                sidebarStyle={undefined}
                contentClassName={`overflow-hidden ${expandedSection === 'support-detailed' ? 'flex flex-col min-h-0' : ''}`}
                contentStyle={undefined}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Support Tabs</div>
                        <input
                            value={supportSearch}
                            onChange={(e) => setSupportSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs focus:outline-none mb-2"
                            style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'support-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredSupportMetrics.length === 0) {
                                    return <div className="text-center italic py-6 text-xs" style={{ color: 'var(--text-muted)' }}>No support stats match this filter</div>;
                                }
                                return filteredSupportMetrics.map((metric) => (
                                    <button
                                        key={metric.id}
                                        onClick={() => setActiveSupportStat(metric.id)}
                                        className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeSupportStat === metric.id
                                            ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                            : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                        style={activeSupportStat !== metric.id ? { color: 'var(--text-secondary)' } : undefined}
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
                            const metric = SUPPORT_METRICS.find((entry) => entry.id === activeSupportStat) || SUPPORT_METRICS[0];
                            const resolveSupportTotal = (row: any) => {
                                if (metric.id === 'condiCleanse') {
                                    const squad = row.supportTotals?.condiCleanse || 0;
                                    const self = row.supportTotals?.condiCleanseSelf || 0;
                                    return cleanseScope === 'all' ? squad + self : squad;
                                }
                                return row.supportTotals?.[metric.id] || 0;
                            };
                            const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                            const rows = [...stats.supportPlayers]
                                .map((row: any) => ({
                                    ...row,
                                    total: resolveSupportTotal(row),
                                    per1s: resolveSupportTotal(row) / totalSeconds(row),
                                    per60s: (resolveSupportTotal(row) * 60) / totalSeconds(row)
                                }))
                                .sort((a, b) => {
                                    const aValue = sortState.key === 'fightTime'
                                        ? Number(a.activeMs || 0)
                                        : Number(supportViewMode === 'total' ? a.total : supportViewMode === 'per1s' ? a.per1s : a.per60s);
                                    const bValue = sortState.key === 'fightTime'
                                        ? Number(b.activeMs || 0)
                                        : Number(supportViewMode === 'total' ? b.total : supportViewMode === 'per1s' ? b.per1s : b.per60s);
                                    const diff = sortState.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                    return diff || a.account.localeCompare(b.account);
                                });

                            return (
                                <StatsTableShell
                                    expanded={expandedSection === 'support-detailed'}
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
                                                    {supportViewMode === 'total' ? 'Total' : supportViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
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
                                                            const value = supportViewMode === 'total'
                                                                ? row.total
                                                                : supportViewMode === 'per1s'
                                                                    ? row.per1s
                                                                    : row.per60s;
                                                            const decimals = metric.isTime
                                                                ? 1
                                                                : (roundCountStats && supportViewMode === 'total' ? 0 : 2);
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
