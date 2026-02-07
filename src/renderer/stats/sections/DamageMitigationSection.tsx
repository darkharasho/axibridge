import { useState } from 'react';
import { Maximize2, ShieldAlert, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';

type DamageMitigationSectionProps = {
    stats: any;
    DAMAGE_MITIGATION_METRICS: Array<{ id: string; label: string }>;
    damageMitigationSearch: string;
    setDamageMitigationSearch: (value: string) => void;
    activeDamageMitigationStat: string;
    setActiveDamageMitigationStat: (value: string) => void;
    damageMitigationViewMode: 'total' | 'per1s' | 'per60s';
    setDamageMitigationViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    damageMitigationScope: 'player' | 'minions';
    setDamageMitigationScope: (value: 'player' | 'minions') => void;
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

export const DamageMitigationSection = ({
    stats,
    DAMAGE_MITIGATION_METRICS,
    damageMitigationSearch,
    setDamageMitigationSearch,
    activeDamageMitigationStat,
    setActiveDamageMitigationStat,
    damageMitigationViewMode,
    setDamageMitigationViewMode,
    damageMitigationScope,
    setDamageMitigationScope,
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
}: DamageMitigationSectionProps) => {
    const initialSortColumnId = DAMAGE_MITIGATION_METRICS.find((metric) => metric.id === 'totalMitigation')?.id
        || DAMAGE_MITIGATION_METRICS[0]?.id
        || 'totalMitigation';
    const [sortState, setSortState] = useState<{ key: 'value' | 'fightTime'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({
        columnId: initialSortColumnId,
        dir: 'desc'
    });
    const isExpanded = expandedSection === 'defense-mitigation';
    const [selectedMitigationColumnIds, setSelectedMitigationColumnIds] = useState<string[]>([]);
    const [selectedMitigationPlayers, setSelectedMitigationPlayers] = useState<string[]>([]);
    const [selectedMinionTypes, setSelectedMinionTypes] = useState<string[]>([]);

    const mitigationPlayers = stats.damageMitigationPlayers || [];
    const mitigationMinions = stats.damageMitigationMinions || [];
    const mitigationRows = damageMitigationScope === 'minions'
        ? mitigationMinions
        : mitigationPlayers;
    const hasMitigationData = mitigationPlayers.length > 0 || mitigationMinions.length > 0;
    const filteredMitigationMetrics = DAMAGE_MITIGATION_METRICS.filter((metric) =>
        metric.label.toLowerCase().includes(damageMitigationSearch.trim().toLowerCase())
    );
    const mitigationColumnOptions = DAMAGE_MITIGATION_METRICS.map((metric) => ({ id: metric.id, label: metric.label }));
    const mitigationColumnOptionsFiltered = mitigationColumnOptions.filter((option) =>
        option.label.toLowerCase().includes(damageMitigationSearch.trim().toLowerCase())
    );
    const selectedMitigationMetrics = selectedMitigationColumnIds.length > 0
        ? DAMAGE_MITIGATION_METRICS.filter((metric) => selectedMitigationColumnIds.includes(metric.id))
        : DAMAGE_MITIGATION_METRICS;
    const visibleMitigationMetrics = selectedMitigationMetrics;
    const mitigationPlayerOptions = Array.from(new Map(
        mitigationRows.map((row: any) => [row.account, row])
    ).values()).map((row: any) => ({
        id: row.account,
        label: row.account,
        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
    }));
    const mitigationMinionOptions = Array.from(new Map(
        mitigationMinions.map((row: any) => [row.minion, row])
    ).values())
        .filter((row: any) => row?.minion)
        .map((row: any) => ({
            id: String(row.minion),
            label: String(row.minion)
        }));
    const mitigationSearchSelectedIds = new Set([
        ...selectedMitigationColumnIds.map((id) => `column:${id}`),
        ...selectedMitigationPlayers.map((id) => `player:${id}`)
    ]);
    const updateSort = (key: 'value' | 'fightTime') => {
        setSortState((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    const formatValue = (value: number) => {
        const decimals = roundCountStats && damageMitigationViewMode === 'total' ? 0 : 2;
        return formatWithCommas(value, decimals);
    };

    return (
        <div
            id="defense-mitigation"
            data-section-visible={isSectionVisible('defense-mitigation')}
            data-section-first={isFirstVisibleSection('defense-mitigation')}
            className={sectionClass('defense-mitigation', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                expandedSection === 'defense-mitigation'
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`)}
        >
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-emerald-300" />
                    Defenses - Damage Mitigation
                </h3>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'defense-mitigation' ? closeExpandedSection() : openExpandedSection('defense-mitigation'))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={expandedSection === 'defense-mitigation' ? 'Close Damage Mitigation' : 'Expand Damage Mitigation'}
                    title={expandedSection === 'defense-mitigation' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'defense-mitigation' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>
            <div className="text-xs text-amber-200/80 italic mb-3">
                Damage mitigation is an estimate based on enemy skill damage averages and avoidance events (block/evade/miss/invuln/interrupted). Use it for relative comparison rather than exact prevention totals.
            </div>
            {!hasMitigationData ? (
                <div className="text-center text-gray-500 italic py-8">No damage mitigation stats available</div>
            ) : isExpanded ? (
                <div className="flex flex-col gap-4">
                    <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Mitigation Tabs</div>
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
                                activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                                inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                            />
                            <PillToggleGroup
                                value={damageMitigationViewMode}
                                onChange={setDamageMitigationViewMode}
                                options={[
                                    { value: 'total', label: 'Total' },
                                    { value: 'per1s', label: 'Stat/1s' },
                                    { value: 'per60s', label: 'Stat/60s' }
                                ]}
                                activeClassName="bg-sky-500/20 text-sky-200 border border-sky-500/40"
                                inactiveClassName="border border-transparent text-gray-400 hover:text-white"
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
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
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
                                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                        >
                                            <span>{label}</span>
                                            <span className="text-gray-400">×</span>
                                        </button>
                                    );
                                })}
                                {selectedMitigationPlayers.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedMitigationPlayers((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                    >
                                        <span>{id}</span>
                                        <span className="text-gray-400">×</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {damageMitigationScope === 'minions' && selectedMinionTypes.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedMinionTypes([])}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                >
                                    Clear Minions
                                </button>
                                {selectedMinionTypes.map((id) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedMinionTypes((prev) => prev.filter((entry) => entry !== id))}
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
                        {mitigationRows.length === 0 ? (
                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
                                No {damageMitigationScope === 'minions' ? 'minion' : 'player'} mitigation stats available
                            </div>
                        ) : filteredMitigationMetrics.length === 0 ? (
                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">No mitigation stats match this filter</div>
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
                                                        <span className="text-gray-500 font-mono">{idx + 1}</span>
                                                        {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                                        <div className="min-w-0">
                                                            <div className="truncate">{entry.row.account}</div>
                                                            {entry.row.minion && (
                                                                <div className="text-[10px] text-gray-500 truncate">{entry.row.minion}</div>
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
                    sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'defense-mitigation' ? 'h-full flex-1' : 'self-start'}`}
                    contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'defense-mitigation' ? 'flex flex-col min-h-0' : ''}`}
                    sidebar={
                        <>
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Mitigation Tabs</div>
                            <input
                                value={damageMitigationSearch}
                                onChange={(e) => setDamageMitigationSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2 mt-2"
                            />
                            <div className={`${sidebarListClass} ${expandedSection === 'defense-mitigation' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                {(() => {
                                    if (filteredMitigationMetrics.length === 0) {
                                        return <div className="text-center text-gray-500 italic py-6 text-xs">No mitigation stats match this filter</div>;
                                    }
                                    return filteredMitigationMetrics.map((metric) => (
                                        <button
                                            key={metric.id}
                                            onClick={() => setActiveDamageMitigationStat(metric.id)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeDamageMitigationStat === metric.id
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
                                            <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                                <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                                <div className="text-xs uppercase tracking-widest text-gray-500">Mitigation</div>
                                            </div>
                                        }
                                        columns={
                                            <>
                                                <div className="flex items-center justify-between px-4 py-2 bg-white/5 gap-2 flex-wrap">
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
                                                        activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                    />
                                                    <PillToggleGroup
                                                        value={damageMitigationViewMode}
                                                        onChange={setDamageMitigationViewMode}
                                                        options={[
                                                            { value: 'total', label: 'Total' },
                                                            { value: 'per1s', label: 'Stat/1s' },
                                                            { value: 'per60s', label: 'Stat/60s' }
                                                        ]}
                                                        activeClassName="bg-sky-500/20 text-sky-200 border border-sky-500/40"
                                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-[0.4fr_1.6fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                    <div className="text-center">#</div>
                                                    <div>Player</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateSort('value')}
                                                        className={`text-right transition-colors ${sortState.key === 'value' ? 'text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                    >
                                                        {damageMitigationViewMode === 'total' ? 'Total' : damageMitigationViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
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
                                            rows.length === 0 ? (
                                                <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
                                                    No {damageMitigationScope === 'minions' ? 'minion' : 'player'} mitigation stats available
                                                </div>
                                            ) : (
                                                <>
                                                    {rows.map((row: any, idx: number) => (
                                                        <div key={`${metric.id}-${row.account}-${row.minion || 'player'}-${idx}`} className="grid grid-cols-[0.4fr_1.6fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                            <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                <div className="min-w-0">
                                                                    <div className="truncate">{row.account}</div>
                                                                    {row.minion && <div className="text-[10px] text-gray-500 truncate">{row.minion}</div>}
                                                                </div>
                                                            </div>
                                                            <div className="text-right font-mono text-gray-300">
                                                                {(() => {
                                                                    const value = damageMitigationViewMode === 'total'
                                                                        ? row.total
                                                                        : damageMitigationViewMode === 'per1s'
                                                                            ? row.per1s
                                                                            : row.per60s;
                                                                    return formatValue(value);
                                                                })()}
                                                            </div>
                                                            <div className="text-right font-mono text-gray-400">
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
