import { useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { Columns, Users, Shield } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { DEFENSE_METRICS } from '../statsMetrics';
import { NoEgoMetricSection } from './NoEgoMetricSection';
import { expandedPaneProps } from './expandedPane';

// For defense, lower damage taken / fewer downs = better; higher blocks/evades = better
const DEFENSE_HIGHER_IS_BETTER = new Set([
    'damageBarrier', 'damageBarrierCount', 'blockedCount', 'evadedCount', 'missedCount', 'dodgeCount', 'invulnedCount'
]);

type DefenseSectionProps = {
    defenseSearch: string;
    setDefenseSearch: (value: string) => void;
    activeDefenseStat: string;
    setActiveDefenseStat: (value: string) => void;
    defenseViewMode: 'total' | 'per1s' | 'per60s';
    setDefenseViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    noEgoMode?: boolean;
};

export const DefenseSection = ({
    defenseSearch,
    setDefenseSearch,
    activeDefenseStat,
    setActiveDefenseStat,
    defenseViewMode,
    setDefenseViewMode,
    noEgoMode = false,
}: DefenseSectionProps) => {
    const { stats, roundCountStats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const {
        sortState, updateSort, ariaSort,
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
    const [detailOpen, setDetailOpen] = useState(false);
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

    // ── No Ego mode: sidebar + one large MetricDistributionCard for active metric ──
    if (noEgoMode && stats.defensePlayers.length > 0) {
        return (
            <NoEgoMetricSection
                title="Defense Detailed"
                icon={<Shield className="w-4 h-4 shrink-0" style={{ color: 'var(--section-defense)' }} />}
                accentColor="var(--section-defense)"
                sidebarLabel="Defensive Tabs"
                keyPrefix="noego-defense"
                metrics={DEFENSE_METRICS}
                filteredMetrics={filteredDefenseMetrics}
                players={stats.defensePlayers}
                roleClassifications={stats.roleClassifications}
                activeStatId={activeDefenseStat}
                setActiveStatId={setActiveDefenseStat}
                search={defenseSearch}
                setSearch={setDefenseSearch}
                viewMode={defenseViewMode}
                setViewMode={setDefenseViewMode}
                detailOpen={detailOpen}
                setDetailOpen={setDetailOpen}
                higherIsBetter={(m) => DEFENSE_HIGHER_IS_BETTER.has(m.id)}
                resolveTotal={(row, m) => row.defenseTotals?.[m.id] || 0}
                isRateOrPercent={(m) => !!(m as any).isPercent}
                fightTimeMs={(row) => row.activeMs || 0}
                formatValue={(m, val) => {
                    const isPercent = (m as any).isPercent;
                    const decimals = roundCountStats && !isPercent && defenseViewMode === 'total' ? 0 : 2;
                    const formatted = formatWithCommas(val, decimals);
                    return isPercent ? `${formatted}%` : formatted;
                }}
            />
        );
    }

    return (
    <div {...expandedPaneProps(expandedSection === 'defense-detailed', expandedSectionClosing)}>
        <div className="flex flex-wrap items-center gap-2 mb-3.5">
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
                    />
                )}
                <SectionExpandButton
                    expanded={expandedSection === 'defense-detailed'}
                    onToggle={() => (expandedSection === 'defense-detailed' ? closeExpandedSection() : openExpandedSection('defense-detailed'))}
                    section="Defense Detailed"
                />
            </div>
        </div>
        {stats.defensePlayers.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No defensive stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
                        <div className="h-5 w-px" style={{ background: 'var(--border-subtle)' }} />
                        <PillToggleGroup
                            value={defenseViewMode}
                            onChange={setDefenseViewMode}
                            options={[
                                { value: 'total', label: 'Total' },
                                { value: 'per1s', label: 'Stat/1s' },
                                { value: 'per60s', label: 'Stat/60s' }
                            ]}
                        />
                        {visibleDefenseMetrics.some((metric) => isMinionDamageMetric(metric.id)) && (
                            <PillToggleGroup
                                value={minionDamageMode}
                                onChange={(value) => setMinionDamageMode(value as 'combined' | 'separate')}
                                options={[
                                    { value: 'combined', label: 'Combined' },
                                    { value: 'separate', label: 'Separate' }
                                ]}
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
                                className="axi-btn axi-btn--xs"
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
                                        className="axi-chip axi-chip--accent axi-chip--action"
                                    >
                                        <span>{label}</span>
                                        <span>×</span>
                                    </button>
                                );
                            })}
                            {selectedDefensePlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedDefensePlayers((prev) => prev.filter((entry) => entry !== id))}
                                    className="axi-chip axi-chip--accent axi-chip--action"
                                >
                                    <span>{id}</span>
                                    <span>×</span>
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
                                        metricKey: metricEntry.id,
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
                sidebarClassName={`pr-3 flex flex-col overflow-y-auto ${expandedSection === 'defense-detailed' ? 'h-full flex-1 min-h-0' : ''}`}
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
                            className="axi-input mb-2"
                            style={{ '--axi-input-pad': '5px 8px', '--axi-input-size': '12px' } as React.CSSProperties}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'defense-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredDefenseMetrics.length === 0) {
                                    return <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No defensive stats match this filter</div>;
                                }
                                return filteredDefenseMetrics.map((metric) => (
                                    <button
                                        key={metric.id}
                                        data-metric-key={metric.id}
                                        onClick={() => setActiveDefenseStat(metric.id)}
                                        className="axi-rail__item"
                                        aria-current={activeDefenseStat === metric.id ? 'location' : undefined}
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
                                    animationKey={`${activeDefenseStat}-${defenseViewMode}`}
                                    cols={['0.4fr', '1.5fr', '1fr', '0.9fr']}
head={
<>
<th scope="col">#</th>
<th scope="col">Player</th>
<th scope="col" aria-sort={ariaSort('value')}><button
                                                    type="button"
                                                    onClick={() => updateSort('value')} className="axi-table__sort"
                                                >
                                                    {defenseViewMode === 'total' ? 'Total' : defenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                    {sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button></th>
<th scope="col" aria-sort={ariaSort('fightTime')}><button
                                                    type="button"
                                                    onClick={() => updateSort('fightTime')} className="axi-table__sort"
                                                >
                                                    Fight Time{sortState.key === 'fightTime' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button></th>
</>
}
rows={
                                        <>
                                            {rows.map((row: any, idx: number) => (
                                                <tr key={`${metric.id}-${row.account}-${idx}`}>
<td>{idx + 1}</td>
<th scope="row"><span className="axi-table__who">{renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                        <span className="min-w-0 flex flex-col">
                                                            <span className="truncate">{row.account}</span>
                                                            {isMinionDamageMetric(metric.id) && minionDamageMode === 'combined' && Array.isArray(row.minionList) && row.minionList.length > 0 && (
                                                                <span className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>{row.minionList.join(', ')}</span>
                                                            )}
                                                            {isMinionDamageMetric(metric.id) && minionDamageMode === 'separate' && row.minionName && (
                                                                <span className="truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>{row.minionName}</span>
                                                            )}
                                                        </span></span></th>
<td>{(() => {
                                                            const value = defenseViewMode === 'total'
                                                                ? row.total
                                                                : defenseViewMode === 'per1s'
                                                                    ? row.per1s
                                                                    : row.per60s;
                                                            const decimals = roundCountStats && defenseViewMode === 'total' ? 0 : 2;
                                                            return formatWithCommas(value, decimals);
                                                        })()}</td>
<td>{row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}</td>
</tr>
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
