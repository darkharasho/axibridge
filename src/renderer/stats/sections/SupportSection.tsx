import { useState } from 'react';
import { HelpingHand, Maximize2, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';

type SupportSectionProps = {
    stats: any;
    SUPPORT_METRICS: Array<{ id: string; label: string; isTime?: boolean }>;
    supportSearch: string;
    setSupportSearch: (value: string) => void;
    activeSupportStat: string;
    setActiveSupportStat: (value: string) => void;
    supportViewMode: 'total' | 'per1s' | 'per60s';
    setSupportViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    cleanseScope: 'all' | 'squad';
    setCleanseScope: (value: 'all' | 'squad') => void;
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

export const SupportSection = ({
    stats,
    SUPPORT_METRICS,
    supportSearch,
    setSupportSearch,
    activeSupportStat,
    setActiveSupportStat,
    supportViewMode,
    setSupportViewMode,
    cleanseScope,
    setCleanseScope,
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
}: SupportSectionProps) => {
    const [sortState, setSortState] = useState<{ key: 'value' | 'fightTime'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({
        columnId: SUPPORT_METRICS[0]?.id || 'value',
        dir: 'desc'
    });
    const isExpanded = expandedSection === 'support-detailed';
    const [selectedSupportColumnIds, setSelectedSupportColumnIds] = useState<string[]>([]);
    const [selectedSupportPlayers, setSelectedSupportPlayers] = useState<string[]>([]);
    const filteredSupportMetrics = SUPPORT_METRICS.filter((metric) =>
        metric.label.toLowerCase().includes(supportSearch.trim().toLowerCase())
    );
    const supportColumnOptions = SUPPORT_METRICS.map((metric) => ({ id: metric.id, label: metric.label }));
    const supportColumnOptionsFiltered = supportColumnOptions.filter((option) =>
        option.label.toLowerCase().includes(supportSearch.trim().toLowerCase())
    );
    const selectedSupportColumns = selectedSupportColumnIds.length > 0
        ? SUPPORT_METRICS.filter((metric) => selectedSupportColumnIds.includes(metric.id))
        : SUPPORT_METRICS;
    const visibleSupportColumns = selectedSupportColumns;
    const supportPlayerOptions = Array.from(new Map(
        stats.supportPlayers.map((row: any) => [row.account, row])
    ).values()).map((row: any) => ({
        id: row.account,
        label: row.account,
        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
    }));
    const supportSearchSelectedIds = new Set([
        ...selectedSupportColumnIds.map((id) => `column:${id}`),
        ...selectedSupportPlayers.map((id) => `player:${id}`)
    ]);
    const updateSort = (key: 'value' | 'fightTime') => {
        setSortState((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    return (
    <div
        id="support-detailed"
        data-section-visible={isSectionVisible('support-detailed')}
        data-section-first={isFirstVisibleSection('support-detailed')}
        className={sectionClass('support-detailed', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
            expandedSection === 'support-detailed'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <HelpingHand className="w-5 h-5 text-emerald-300" />
                Support - Detailed
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'support-detailed' ? closeExpandedSection() : openExpandedSection('support-detailed'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'support-detailed' ? 'Close Support Detailed' : 'Expand Support Detailed'}
                title={expandedSection === 'support-detailed' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'support-detailed' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {stats.supportPlayers.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No support stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Support Tabs</div>
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
                            activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                        />
                        {activeSupportStat === 'condiCleanse' && (
                            <PillToggleGroup
                                value={cleanseScope}
                                onChange={setCleanseScope}
                                options={[
                                    { value: 'all', label: 'All' },
                                    { value: 'squad', label: 'Squad' }
                                ]}
                                activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                                inactiveClassName="border border-transparent text-gray-400 hover:text-white"
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
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
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
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                    >
                                        <span>{label}</span>
                                        <span className="text-gray-400">×</span>
                                    </button>
                                );
                            })}
                            {selectedSupportPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedSupportPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {filteredSupportMetrics.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-500 italic text-sm">No support stats match this filter</div>
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
                expanded={expandedSection === 'support-detailed'}
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'support-detailed' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'support-detailed' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Support Tabs</div>
                        <input
                            value={supportSearch}
                            onChange={(e) => setSupportSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'support-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredSupportMetrics.length === 0) {
                                    return <div className="text-center text-gray-500 italic py-6 text-xs">No support stats match this filter</div>;
                                }
                                return filteredSupportMetrics.map((metric) => (
                                    <button
                                        key={metric.id}
                                        onClick={() => setActiveSupportStat(metric.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeSupportStat === metric.id
                                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
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
                                    header={
                                        <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                            <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                            <div className="text-xs uppercase tracking-widest text-gray-500">Support</div>
                                        </div>
                                    }
                                    columns={
                                        <>
                                            {metric.id === 'condiCleanse' ? (
                                                <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white/5">
                                                    <PillToggleGroup
                                                        value={cleanseScope}
                                                        onChange={setCleanseScope}
                                                        options={[
                                                            { value: 'all', label: 'All' },
                                                            { value: 'squad', label: 'Squad' }
                                                        ]}
                                                        activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                    />
                                                    <PillToggleGroup
                                                        value={supportViewMode}
                                                        onChange={setSupportViewMode}
                                                        options={[
                                                            { value: 'total', label: 'Total' },
                                                            { value: 'per1s', label: 'Stat/1s' },
                                                            { value: 'per60s', label: 'Stat/60s' }
                                                        ]}
                                                        className="sm:ml-auto"
                                                        activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap items-center justify-start sm:justify-end px-4 py-2 bg-white/5">
                                                    <PillToggleGroup
                                                        value={supportViewMode}
                                                        onChange={setSupportViewMode}
                                                        options={[
                                                            { value: 'total', label: 'Total' },
                                                            { value: 'per1s', label: 'Stat/1s' },
                                                            { value: 'per60s', label: 'Stat/60s' }
                                                        ]}
                                                        activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                    />
                                                </div>
                                            )}
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('value')}
                                                    className={`text-right transition-colors ${sortState.key === 'value' ? 'text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                >
                                                    {supportViewMode === 'total' ? 'Total' : supportViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                    {sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('fightTime')}
                                                    className={`text-right transition-colors ${sortState.key === 'fightTime' ? 'text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
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
