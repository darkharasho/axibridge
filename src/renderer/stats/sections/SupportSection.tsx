import { useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { Columns, Users } from 'lucide-react';
import { SupportPlusIcon } from '../../ui/SupportPlusIcon';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { SUPPORT_METRICS, CleanseScope, resolveCleanseTotal, hasMinionCleanseData, hasPartialMinionCleanseData, hasArcdpsMethodologyData } from '../statsMetrics';
import { NoEgoMetricSection } from './NoEgoMetricSection';
import { expandedPaneProps } from './expandedPane';

// All current support metrics are higher-is-better. Add metric ids here if any
// lower-is-better metric is introduced (e.g. a "deaths taken" type metric).
const SUPPORT_LOWER_IS_BETTER = new Set<string>([]);

type SupportSectionProps = {
    supportSearch: string;
    setSupportSearch: (value: string) => void;
    activeSupportStat: string;
    setActiveSupportStat: (value: string) => void;
    supportViewMode: 'total' | 'per1s' | 'per60s';
    setSupportViewMode: (value: 'total' | 'per1s' | 'per60s') => void;
    cleanseScope: CleanseScope;
    setCleanseScope: (value: CleanseScope) => void;
    noEgoMode?: boolean;
};

export const SupportSection = ({
    supportSearch,
    setSupportSearch,
    activeSupportStat,
    setActiveSupportStat,
    supportViewMode,
    setSupportViewMode,
    cleanseScope,
    setCleanseScope,
    noEgoMode = false,
}: SupportSectionProps) => {
    const { stats, roundCountStats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const {
        sortState, updateSort, ariaSort,
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
    const [detailOpen, setDetailOpen] = useState(false);

    // The arcdps scope can only be answered by logs the axilog backend parsed
    // locally — Elite-Insights-parsed logs and dps.report-hydrated details
    // carry neither cleanse family, and a missing key reads as 0. Rather than
    // show an EI number under an arcdps label, hide the option and fall back
    // to EI parity ('all') for this dataset.
    const minionCleanseAvailable = hasMinionCleanseData(stats.supportPlayers);
    const minionCleansePartial = hasPartialMinionCleanseData(stats.supportPlayers);
    // Newer logs answer the scope with a transcription of the arcdps meter's
    // own counting code; older ones only with the EI-plus-minions
    // approximation, which reads a few percent high. Both are labelled
    // "arcdps"; only the tooltip distinguishes them.
    const arcdpsMethodology = hasArcdpsMethodologyData(stats.supportPlayers);
    const effectiveCleanseScope: CleanseScope =
        cleanseScope === 'arcdps' && !minionCleanseAvailable ? 'all' : cleanseScope;
    const cleanseScopeOptions = [
        ...(minionCleanseAvailable ? [{
            value: 'arcdps' as const,
            label: 'arcdps',
            title: (arcdpsMethodology
                ? "Counted the way the in-game arcdps meter counts, from a transcription of its own source: pets folded into their master, single-stack stability removals and self-consumed blinds excluded, and the removal burst from going down subtracted."
                : 'Approximates the in-game arcdps meter: squad + self + conditions cleansed off squad pets/minions. Logs in this range predate the arcdps-methodology counters, so the exclusions the meter applies are missing and this reads a few percent high.')
                + (minionCleansePartial ? ' Only some logs in this range carry the data, so this is a lower bound.' : '')
        }] : []),
        {
            value: 'all' as const,
            label: 'All',
            title: 'Elite Insights parity: squad + self. Matches dps.report. Excludes pets/minions, which is why it reads a few percent below the in-game arcdps meter.'
        },
        {
            value: 'squad' as const,
            label: 'Squad',
            title: 'Conditions cleansed off other squad members only — excludes self and pets/minions.'
        }
    ];

    // ── No Ego mode: sidebar + one large MetricDistributionCard for active metric ──
    if (noEgoMode && stats.supportPlayers.length > 0) {
        const resolveSupportTotalForMetric = (row: any, metricId: string) => {
            if (metricId === 'condiCleanse') return resolveCleanseTotal(row, effectiveCleanseScope);
            return row.supportTotals?.[metricId] || 0;
        };
        return (
            <NoEgoMetricSection
                title="Support Detailed"
                icon={<span className="flex shrink-0" style={{ color: 'var(--section-support)' }}><SupportPlusIcon className="w-4 h-4" /></span>}
                accentColor="var(--section-support)"
                sidebarLabel="Support Tabs"
                keyPrefix="noego-support"
                metrics={SUPPORT_METRICS}
                filteredMetrics={filteredSupportMetrics}
                players={stats.supportPlayers}
                roleClassifications={stats.roleClassifications}
                activeStatId={activeSupportStat}
                setActiveStatId={setActiveSupportStat}
                search={supportSearch}
                setSearch={setSupportSearch}
                viewMode={supportViewMode}
                setViewMode={setSupportViewMode}
                detailOpen={detailOpen}
                setDetailOpen={setDetailOpen}
                higherIsBetter={(m) => !SUPPORT_LOWER_IS_BETTER.has(m.id)}
                resolveTotal={(row, m) => resolveSupportTotalForMetric(row, m.id)}
                isRateOrPercent={() => false}
                fightTimeMs={(row) => row.activeMs || 0}
                formatValue={(m, val) => {
                    const decimals = (m as any).isTime
                        ? 1
                        : (roundCountStats && supportViewMode === 'total' ? 0 : 2);
                    return formatWithCommas(val, decimals);
                }}
            />
        );
    }

    return (
    <div {...expandedPaneProps(expandedSection === 'support-detailed', expandedSectionClosing)}>
        <div className="flex flex-wrap items-center gap-2 mb-3.5">
            <span className="flex shrink-0" style={{ color: 'var(--section-support)' }}><SupportPlusIcon className="w-4 h-4" /></span>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                Support Detailed
            </h3>
            <div className="ml-auto flex items-center gap-2">
                {!isExpanded && activeSupportStat === 'condiCleanse' && (
                    <PillToggleGroup
                        value={effectiveCleanseScope}
                        onChange={setCleanseScope}
                        options={cleanseScopeOptions}
                    />
                )}
                {!isExpanded && (
                    <PillToggleGroup
                        value={supportViewMode}
                        onChange={setSupportViewMode}
                        options={[
                            { value: 'total', label: 'Total' },
                            { value: 'per1s', label: 'Stat/1s' },
                            { value: 'per60s', label: 'Stat/60s' }
                        ]}
                    />
                )}
                <SectionExpandButton
                    expanded={expandedSection === 'support-detailed'}
                    onToggle={() => (expandedSection === 'support-detailed' ? closeExpandedSection() : openExpandedSection('support-detailed'))}
                    section="Support Detailed"
                />
            </div>
        </div>
        {stats.supportPlayers.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No support stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
                        <div className="h-5 w-px" style={{ background: 'var(--border-subtle)' }} />
                        <PillToggleGroup
                            value={supportViewMode}
                            onChange={setSupportViewMode}
                            options={[
                                { value: 'total', label: 'Total' },
                                { value: 'per1s', label: 'Stat/1s' },
                                { value: 'per60s', label: 'Stat/60s' }
                            ]}
                        />
                        {activeSupportStat === 'condiCleanse' && (
                            <PillToggleGroup
                                value={effectiveCleanseScope}
                                onChange={setCleanseScope}
                                options={cleanseScopeOptions}
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
                                className="axi-btn axi-btn--xs"
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
                                        className="axi-chip axi-chip--accent axi-chip--action"
                                    >
                                        <span>{label}</span>
                                        <span>×</span>
                                    </button>
                                );
                            })}
                            {selectedSupportPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedSupportPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {filteredSupportMetrics.length === 0 ? (
                        <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No support stats match this filter</div>
                    ) : (
                        (() => {
                            const resolveSupportTotal = (row: any, metricId: string) => {
                                if (metricId === 'condiCleanse') {
                                    return resolveCleanseTotal(row, effectiveCleanseScope);
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
                                        metricKey: metric.id,
                                        label: metric.id === 'resurrects'
                                            ? <span title="Channel starts, not completed revives — see Defense → Revives for completed pickups and attribution.">{metric.label}</span>
                                            : metric.label,
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
            <StatsTableLayout
                expanded={expandedSection === 'support-detailed'}
                sidebarClassName={`pr-3 flex flex-col overflow-y-auto ${expandedSection === 'support-detailed' ? 'h-full flex-1 min-h-0' : ''}`}
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
                            className="axi-input mb-2"
                            style={{ '--axi-input-pad': '5px 8px', '--axi-input-size': '12px' } as React.CSSProperties}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'support-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredSupportMetrics.length === 0) {
                                    return <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No support stats match this filter</div>;
                                }
                                return filteredSupportMetrics.map((metric) => (
                                    <button
                                        key={metric.id}
                                        data-metric-key={metric.id}
                                        onClick={() => setActiveSupportStat(metric.id)}
                                        title={metric.id === 'resurrects'
                                            ? 'Channel starts, not completed revives — see Defense → Revives for completed pickups and attribution.'
                                            : undefined}
                                        className="axi-rail__item"
                                        aria-current={activeSupportStat === metric.id ? 'location' : undefined}
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
                                    return resolveCleanseTotal(row, effectiveCleanseScope);
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
                                <>
                                {metric.id === 'resurrects' && (
                                    <div className="mb-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                        Resurrect Attempts counts hand-resurrect channel starts, not completed
                                        revives. See Defense → Revives for completed pickups, attribution, and
                                        Illusion of Life survival.
                                    </div>
                                )}
                                <StatsTableShell
                                    expanded={expandedSection === 'support-detailed'}
                                    animationKey={`${activeSupportStat}-${supportViewMode}`}
                                    cols={['0.4fr', '1.5fr', '1fr', '0.9fr']}
head={
<>
<th scope="col">#</th>
<th scope="col">Player</th>
<th scope="col" aria-sort={ariaSort('value')}><button
                                                    type="button"
                                                    onClick={() => updateSort('value')} className="axi-table__sort"
                                                >
                                                    {supportViewMode === 'total' ? 'Total' : supportViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
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
                                                        <span className="truncate">{row.account}</span></span></th>
<td>{(() => {
                                                            const value = supportViewMode === 'total'
                                                                ? row.total
                                                                : supportViewMode === 'per1s'
                                                                    ? row.per1s
                                                                    : row.per60s;
                                                            const decimals = metric.isTime
                                                                ? 1
                                                                : (roundCountStats && supportViewMode === 'total' ? 0 : 2);
                                                            return formatWithCommas(value, decimals);
                                                        })()}</td>
<td>{row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}</td>
</tr>
                                            ))}
                                        </>
                                    }
                                />
                                </>
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
