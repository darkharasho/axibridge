import { useState } from 'react';
import { Activity, Maximize2, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';

type HealingSectionProps = {
    stats: any;
    HEALING_METRICS: Array<{
        id: string;
        label: string;
        baseField: 'healing' | 'barrier' | 'downedHealing' | 'resUtility';
        perSecond: boolean;
        decimals: number;
    }>;
    activeHealingMetric: string;
    setActiveHealingMetric: (value: string) => void;
    healingCategory: 'total' | 'squad' | 'group' | 'self' | 'offSquad';
    setHealingCategory: (value: 'total' | 'squad' | 'group' | 'self' | 'offSquad') => void;
    activeResUtilitySkill: string;
    setActiveResUtilitySkill: (value: string) => void;
    skillUsageData: { resUtilitySkills?: Array<{ id: string; name: string }> };
    formatWithCommas: (value: number, decimals: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const HealingSection = ({
    stats,
    HEALING_METRICS,
    activeHealingMetric,
    setActiveHealingMetric,
    healingCategory,
    setHealingCategory,
    activeResUtilitySkill,
    setActiveResUtilitySkill,
    skillUsageData,
    formatWithCommas,
    renderProfessionIcon,
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: HealingSectionProps) => {
    const [sortState, setSortState] = useState<{ key: 'value' | 'fightTime'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({
        columnId: HEALING_METRICS[0]?.id || 'value',
        dir: 'desc'
    });
    const isExpanded = expandedSection === 'healing-stats';
    const filteredHealingMetrics = HEALING_METRICS;
    const [selectedHealingPlayers, setSelectedHealingPlayers] = useState<string[]>([]);
    const [selectedHealingColumnIds, setSelectedHealingColumnIds] = useState<string[]>([]);
    const healingPlayerOptions = Array.from(new Map(
        stats.healingPlayers.map((row: any) => [row.account, row])
    ).values()).map((row: any) => ({
        id: row.account,
        label: row.account,
        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
    }));
    const healingSearchSelectedIds = new Set([
        ...selectedHealingColumnIds.map((id) => `column:${id}`),
        ...selectedHealingPlayers.map((id) => `player:${id}`)
    ]);
    const healingColumnOptions = HEALING_METRICS.map((metric) => ({ id: metric.id, label: metric.label }));
    const selectedHealingColumns = selectedHealingColumnIds.length > 0
        ? HEALING_METRICS.filter((metric) => selectedHealingColumnIds.includes(metric.id))
        : HEALING_METRICS;
    const updateSort = (key: 'value' | 'fightTime') => {
        setSortState((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    return (
    <div
        id="healing-stats"
        data-section-visible={isSectionVisible('healing-stats')}
        data-section-first={isFirstVisibleSection('healing-stats')}
        className={sectionClass('healing-stats', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
            expandedSection === 'healing-stats'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Activity className="w-5 h-5 text-lime-300" />
                Healing Stats
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'healing-stats' ? closeExpandedSection() : openExpandedSection('healing-stats'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'healing-stats' ? 'Close Healing Stats' : 'Expand Healing Stats'}
                title={expandedSection === 'healing-stats' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'healing-stats' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {stats.healingPlayers.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No healing stats available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Healing Tabs</div>
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
                            activeClassName="bg-lime-500/20 text-lime-200 border border-lime-500/40"
                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
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
                            activeClassName="bg-lime-500/20 text-lime-200 border border-lime-500/40"
                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
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
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
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
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                    >
                                        <span>{label}</span>
                                        <span className="text-gray-400">×</span>
                                    </button>
                                );
                            })}
                            {selectedHealingPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedHealingPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                                            <span className="text-gray-500 font-mono">{idx + 1}</span>
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
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'healing-stats' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'healing-stats' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Healing Tabs</div>
                        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                            {HEALING_METRICS.map((metric) => (
                                <button
                                    key={metric.id}
                                    onClick={() => setActiveHealingMetric(metric.id)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeHealingMetric === metric.id
                                        ? 'bg-lime-500/20 text-lime-200 border-lime-500/40'
                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                        }`}
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
                                        <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                            <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                            <div className="text-xs uppercase tracking-widest text-gray-500">Healing</div>
                                        </div>
                                    }
                                    columns={
                                        <>
                                            {isResUtilityMetric && (
                                                <div className="flex items-center justify-end px-4 py-2 bg-white/5 flex-wrap">
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
                                                        activeClassName="bg-lime-500/20 text-lime-200 border border-lime-500/40"
                                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                                    />
                                                </div>
                                            )}
                                            {!isResUtilityMetric && (
                                                <div className="flex items-center justify-end px-4 py-2 bg-white/5">
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
                                                        activeClassName="bg-lime-500/20 text-lime-200 border border-lime-500/40"
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
                                                    className={`text-right transition-colors ${sortState.key === 'value' ? 'text-lime-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                >
                                                    {metric.label}{sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateSort('fightTime')}
                                                    className={`text-right transition-colors ${sortState.key === 'fightTime' ? 'text-lime-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                >
                                                    Fight Time{sortState.key === 'fightTime' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                </button>
                                            </div>
                                        </>
                                    }
                                    rows={
                                        <>
                                            {rows.length === 0 ? (
                                                <div className="px-4 py-6 text-sm text-gray-500 italic">No healing data for this view</div>
                                            ) : (
                                                rows.map((row: any, idx: number) => (
                                                    <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                        <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">
                                                            {formatWithCommas(row.value, metric.decimals)}
                                                        </div>
                                                        <div className="text-right font-mono text-gray-400">
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
