import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { Maximize2, X, Columns, Users, HeartPulse } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { HEALING_METRICS } from '../statsMetrics';

type HealingSectionProps = {
    activeHealingMetric: string;
    setActiveHealingMetric: (value: string) => void;
    healingCategory: 'total' | 'squad' | 'group' | 'self' | 'offSquad';
    setHealingCategory: (value: 'total' | 'squad' | 'group' | 'self' | 'offSquad') => void;
    activeResUtilitySkill: string;
    setActiveResUtilitySkill: (value: string) => void;
    skillUsageData: { resUtilitySkills?: Array<{ id: string; name: string }> };
};

export const HealingSection = ({
    activeHealingMetric,
    setActiveHealingMetric,
    healingCategory,
    setHealingCategory,
    activeResUtilitySkill,
    setActiveResUtilitySkill,
    skillUsageData
}: HealingSectionProps) => {
    const { stats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection } = useStatsSharedContext();
    const {
        sortState, updateSort,
        denseSort, setDenseSort,
        selectedColumnIds: selectedHealingColumnIds, setSelectedColumnIds: setSelectedHealingColumnIds,
        selectedPlayers: selectedHealingPlayers, setSelectedPlayers: setSelectedHealingPlayers,
        columnOptions: healingColumnOptions,
        selectedMetrics: selectedHealingColumns,
        playerOptions: healingPlayerOptions,
        searchSelectedIds: healingSearchSelectedIds,
    } = useMetricSectionState({
        metrics: HEALING_METRICS,
        rows: stats.healingPlayers,
        renderProfessionIcon,
    });
    const isExpanded = expandedSection === 'healing-stats';
    return (
    <div
        className={`stats-share-exclude ${
            expandedSection === 'healing-stats'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`}
        style={expandedSection === 'healing-stats' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
    >
        <div className="flex items-center gap-2 mb-3.5">
            <HeartPulse className="w-4 h-4 shrink-0" style={{ color: 'var(--section-healing)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                Healing Stats
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'healing-stats' ? closeExpandedSection() : openExpandedSection('healing-stats'))}
                className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                aria-label={expandedSection === 'healing-stats' ? 'Close Healing Stats' : 'Expand Healing Stats'}
                title={expandedSection === 'healing-stats' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'healing-stats' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
            </button>
        </div>
        {stats.healingPlayers.length === 0 ? (
            <div className="text-center italic py-8" style={{ color: 'var(--text-muted)' }}>No healing stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Healing Tabs</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...healingColumnOptions.map((option) => ({ ...option, type: 'column' as const })),
                                ...healingPlayerOptions.map((option) => ({ ...option, type: 'player' as const }))
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedHealingColumnIds((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedHealingPlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={healingSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <PillToggleGroup
                            value={healingCategory}
                            onChange={setHealingCategory}
                            options={[
                                { value: 'total', label: 'Total' },
                                { value: 'squad', label: 'Squad' },
                                { value: 'group', label: 'Group' },
                                { value: 'self', label: 'Self' },
                                { value: 'offSquad', label: 'OffSquad' }
                            ]}
                            className="flex-wrap"
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                        <ColumnFilterDropdown
                            options={healingColumnOptions}
                            selectedIds={selectedHealingColumnIds}
                            onToggle={(id) => {
                                setSelectedHealingColumnIds((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedHealingColumnIds([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <PillToggleGroup
                            value={activeResUtilitySkill}
                            onChange={setActiveResUtilitySkill}
                            options={[
                                { value: 'all', label: 'All Res Utility' },
                                ...(skillUsageData.resUtilitySkills || []).map((skill) => ({
                                    value: skill.id,
                                    label: skill.name
                                }))
                            ]}
                            className="flex-wrap"
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                        <ColumnFilterDropdown
                            options={healingPlayerOptions}
                            selectedIds={selectedHealingPlayers}
                            onToggle={(id) => {
                                setSelectedHealingPlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedHealingPlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
                    </div>
                    {(selectedHealingColumnIds.length > 0 || selectedHealingPlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedHealingColumnIds([]);
                                    setSelectedHealingPlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                            >
                                Clear All
                            </button>
                            {selectedHealingColumnIds.map((id) => {
                                const label = healingColumnOptions.find((option) => option.id === id)?.label || id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedHealingColumnIds((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                    >
                                        <span>{label}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                    </button>
                                );
                            })}
                            {selectedHealingPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedHealingPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {(() => {
                        const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                        const resolveFieldName = (metricEntry: typeof HEALING_METRICS[number]) => {
                            const isResUtilityMetric = metricEntry.baseField === 'resUtility';
                            const prefix = isResUtilityMetric
                                ? ''
                                : healingCategory === 'total'
                                    ? ''
                                    : healingCategory === 'offSquad'
                                        ? 'offSquad'
                                        : healingCategory;
                            if (isResUtilityMetric) {
                                return activeResUtilitySkill === 'all' ? 'resUtility' : `resUtility_${activeResUtilitySkill}`;
                            }
                            return prefix
                                ? `${prefix}${metricEntry.baseField[0].toUpperCase()}${metricEntry.baseField.slice(1)}`
                                : metricEntry.baseField;
                        };
                        const rows = [...stats.healingPlayers]
                            .filter((row: any) => selectedHealingPlayers.length === 0 || selectedHealingPlayers.includes(row.account))
                            .filter((row: any) => Object.values(row.healingTotals || {}).some((val: any) => Number(val) > 0))
                            .map((row: any) => {
                                const values: Record<string, string> = {};
                                const numericValues: Record<string, number> = {};
                                selectedHealingColumns.forEach((metricEntry) => {
                                    const fieldName = resolveFieldName(metricEntry);
                                    const baseValue = Number(row.healingTotals?.[fieldName] ?? 0);
                                    const value = metricEntry.perSecond ? baseValue / totalSeconds(row) : baseValue;
                                    numericValues[metricEntry.id] = value;
                                    values[metricEntry.id] = formatWithCommas(value, metricEntry.decimals);
                                });
                                return { row, values, numericValues };
                            })
                            .sort((a, b) => {
                                const resolvedSortColumnId = selectedHealingColumns.find((entry) => entry.id === denseSort.columnId)?.id
                                    || selectedHealingColumns[0]?.id
                                    || '';
                                const aValue = a.numericValues[resolvedSortColumnId] ?? 0;
                                const bValue = b.numericValues[resolvedSortColumnId] ?? 0;
                                const diff = denseSort.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                return diff || String(a.row.account || '').localeCompare(String(b.row.account || ''));
                            });
                        const resolvedSortColumnId = selectedHealingColumns.find((entry) => entry.id === denseSort.columnId)?.id
                            || selectedHealingColumns[0]?.id
                            || '';
                        return (
                            <DenseStatsTable
                                title="Healing - Dense View"
                                subtitle="Healing"
                                sortColumnId={resolvedSortColumnId}
                                sortDirection={denseSort.dir}
                                onSortColumn={(columnId) => {
                                    setDenseSort((prev) => ({
                                        columnId,
                                        dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                    }));
                                }}
                                columns={selectedHealingColumns.map((metricEntry) => ({
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
                    })()}
                </div>
            </div>
        ) : (
            <StatsTableLayout
                expanded={expandedSection === 'healing-stats'}
                sidebarClassName={`px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'healing-stats' ? 'h-full flex-1' : 'self-start'}`}
                sidebarStyle={undefined}
                contentClassName={`overflow-hidden ${expandedSection === 'healing-stats' ? 'flex flex-col min-h-0' : ''}`}
                contentStyle={undefined}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Healing Tabs</div>
                        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                            {HEALING_METRICS.map((metric) => (
                                <button
                                    key={metric.id}
                                    onClick={() => setActiveHealingMetric(metric.id)}
                                    className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeHealingMetric === metric.id
                                        ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                        : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                        }`}
                                    style={activeHealingMetric !== metric.id ? { color: 'var(--text-secondary)' } : undefined}
                                >
                                    {metric.label}
                                </button>
                            ))}
                        </div>
                    </>
                }
                content={
                    <>
                        {(() => {
                            const metric = HEALING_METRICS.find((entry) => entry.id === activeHealingMetric) || HEALING_METRICS[0];
                            const isResUtilityMetric = metric.baseField === 'resUtility';
                            const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                            const prefix = isResUtilityMetric
                                ? ''
                                : healingCategory === 'total'
                                    ? ''
                                    : healingCategory === 'offSquad'
                                        ? 'offSquad'
                                        : healingCategory;
                            const fieldName = isResUtilityMetric
                                ? (activeResUtilitySkill === 'all' ? 'resUtility' : `resUtility_${activeResUtilitySkill}`)
                                : prefix
                                    ? `${prefix}${metric.baseField[0].toUpperCase()}${metric.baseField.slice(1)}`
                                    : metric.baseField;
                            const rows = [...stats.healingPlayers]
                                .filter((row: any) => Object.values(row.healingTotals || {}).some((val: any) => Number(val) > 0))
                                .map((row: any) => {
                                    const baseValue = Number(row.healingTotals?.[fieldName] ?? 0);
                                    const value = metric.perSecond ? baseValue / totalSeconds(row) : baseValue;
                                    return {
                                        ...row,
                                        value
                                    };
                                })
                                .sort((a, b) => {
                                    const aValue = sortState.key === 'fightTime' ? Number(a.activeMs || 0) : Number(a.value || 0);
                                    const bValue = sortState.key === 'fightTime' ? Number(b.activeMs || 0) : Number(b.value || 0);
                                    const diff = sortState.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                    return diff || a.account.localeCompare(b.account);
                                });

                            return (
                                <StatsTableShell
                                    expanded={expandedSection === 'healing-stats'}
                                    header={
                                        <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--bg-hover)' }}>
                                            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{metric.label}</div>
                                            <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Healing</div>
                                        </div>
                                    }
                                    columns={
                                        <>
                                            {isResUtilityMetric && (
                                                <div className="flex items-center justify-end px-4 py-2 flex-wrap" style={{ background: 'var(--bg-hover)' }}>
                                                    <PillToggleGroup
                                                        value={activeResUtilitySkill}
                                                        onChange={setActiveResUtilitySkill}
                                                        options={[
                                                            { value: 'all', label: 'All' },
                                                            ...(skillUsageData.resUtilitySkills || []).map((skill) => ({
                                                                value: skill.id,
                                                                label: skill.name
                                                            }))
                                                        ]}
                                                        className="flex-wrap"
                                                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                                        inactiveClassName="text-[color:var(--text-secondary)]"
                                                    />
                                                </div>
                                            )}
                                            {!isResUtilityMetric && (
                                                <div className="flex items-center justify-end px-4 py-2" style={{ background: 'var(--bg-hover)' }}>
                                                    <PillToggleGroup
                                                        value={healingCategory}
                                                        onChange={setHealingCategory}
                                                        options={[
                                                            { value: 'total', label: 'Total' },
                                                            { value: 'squad', label: 'Squad' },
                                                            { value: 'group', label: 'Group' },
                                                            { value: 'self', label: 'Self' },
                                                            { value: 'offSquad', label: 'OffSquad' }
                                                        ]}
                                                        className="flex-wrap"
                                                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                                        inactiveClassName="text-[color:var(--text-secondary)]"
                                                    />
                                                </div>
                                            )}
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider px-4 py-2" style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}>
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('value')}
                                                    className="text-right transition-colors"
                                                    style={{ color: sortState.key === 'value' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                >
                                                    {metric.label}{sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
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
                                            {rows.length === 0 ? (
                                                <div className="px-4 py-6 text-sm italic" style={{ color: 'var(--text-muted)' }}>No healing data for this view</div>
                                            ) : (
                                                rows.map((row: any, idx: number) => (
                                                    <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm border-t" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}>
                                                        <div className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                            {formatWithCommas(row.value, metric.decimals)}
                                                        </div>
                                                        <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                            {row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
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
