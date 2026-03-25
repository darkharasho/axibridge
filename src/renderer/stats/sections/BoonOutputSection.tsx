import { useMemo } from 'react';
import { Maximize2, X, Columns, Users } from 'lucide-react';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { useStatsSharedContext } from '../StatsViewContext';

type BoonOutputSectionProps = {
    activeBoonCategory: string;
    setActiveBoonCategory: (value: string) => void;
    activeBoonMetric: 'total' | 'average' | 'uptime';
    setActiveBoonMetric: (value: 'total' | 'average' | 'uptime') => void;
    activeBoonTab: string | null;
    setActiveBoonTab: (value: string | null) => void;
    activeBoonTable: any;
    boonSearch: string;
    setBoonSearch: (value: string) => void;
    formatBoonMetricDisplay: (...args: any[]) => string;
    getBoonMetricValue: (...args: any[]) => number;
};

export const BoonOutputSection = ({
    activeBoonCategory,
    setActiveBoonCategory,
    activeBoonMetric,
    setActiveBoonMetric,
    activeBoonTab,
    setActiveBoonTab,
    activeBoonTable,
    boonSearch,
    setBoonSearch,
    formatBoonMetricDisplay,
    getBoonMetricValue
}: BoonOutputSectionProps) => {
    const { stats, renderProfessionIcon, roundCountStats, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const allBoonColumns = stats.boonTables || [];
    const boonMetrics = useMemo(
        () => allBoonColumns.map((boon: any) => ({ ...boon, label: boon.name })),
        [allBoonColumns]
    );
    const boonRows = useMemo(
        () => (stats.boonTables || []).flatMap((t: any) => t.rows || []).filter((r: any) => !!r.account),
        [stats.boonTables]
    );
    const {
        sortState, updateSort,
        denseSort, setDenseSort,
        selectedColumnIds: selectedBoonColumnIds, setSelectedColumnIds: setSelectedBoonColumnIds,
        selectedPlayers: selectedBoonPlayers, setSelectedPlayers: setSelectedBoonPlayers,
        filteredMetrics: filteredBoonTables,
        selectedMetrics: visibleBoonColumns,
        playerOptions: boonPlayerOptions,
        searchSelectedIds: boonSearchSelectedIds,
    } = useMetricSectionState({
        metrics: boonMetrics,
        rows: boonRows,
        search: boonSearch,
        renderProfessionIcon,
    });
    const isExpanded = expandedSection === 'boon-output';
    const boonColumnOptions = filteredBoonTables.map((boon: any) => ({
        id: boon.id,
        label: boon.name,
        icon: boon.icon ? <img src={boon.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
    }));
    return (
    <div
        className={`stats-share-exclude ${expandedSection === 'boon-output'
            ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
            : ''
        }`}
        style={expandedSection === 'boon-output' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
    >
        <div className="flex items-center gap-2 mb-3.5">
            <span className="flex shrink-0" style={{ color: 'var(--section-boon)' }}><Gw2BoonIcon className="w-4 h-4" /></span>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                Boon Output
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'boon-output' ? closeExpandedSection() : openExpandedSection('boon-output'))}
                className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                aria-label={expandedSection === 'boon-output' ? 'Close Boon Output' : 'Expand Boon Output'}
                title={expandedSection === 'boon-output' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'boon-output' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
            </button>
        </div>
        {stats.boonTables.length === 0 ? (
            <div className="text-center italic py-8" style={{ color: 'var(--text-muted)' }}>No boon data available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Boons</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...allBoonColumns.map((boon: any) => ({ id: boon.id, label: boon.name, type: 'column' as const })),
                                ...boonPlayerOptions.map((option) => ({
                                    id: option.id,
                                    label: option.label,
                                    type: 'player' as const,
                                    icon: option.icon,
                                })),
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedBoonColumnIds((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedBoonPlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={boonSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <ColumnFilterDropdown
                            options={boonColumnOptions}
                            selectedIds={selectedBoonColumnIds}
                            onToggle={(id) => {
                                setSelectedBoonColumnIds((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedBoonColumnIds([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <ColumnFilterDropdown
                            options={boonPlayerOptions}
                            selectedIds={selectedBoonPlayers}
                            onToggle={(id) => {
                                setSelectedBoonPlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedBoonPlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
                        <PillToggleGroup
                            value={activeBoonCategory}
                            onChange={setActiveBoonCategory}
                            options={[
                                { value: 'selfBuffs', label: 'Self' },
                                { value: 'groupBuffs', label: 'Group' },
                                { value: 'squadBuffs', label: 'Squad' },
                                { value: 'totalBuffs', label: 'Total' }
                            ]}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                        <PillToggleGroup
                            value={activeBoonMetric}
                            onChange={setActiveBoonMetric}
                            options={[
                                { value: 'total', label: 'Total Gen' },
                                { value: 'average', label: 'Gen/Sec' },
                                { value: 'uptime', label: 'Uptime' }
                            ]}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                    </div>
                    {(selectedBoonColumnIds.length > 0 || selectedBoonPlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedBoonColumnIds([]);
                                    setSelectedBoonPlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                            >
                                Clear All
                            </button>
                            {selectedBoonColumnIds.map((id) => {
                                const label = allBoonColumns.find((boon: any) => boon.id === id)?.name || id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedBoonColumnIds((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                    >
                                        <span>{label}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                    </button>
                                );
                            })}
                            {selectedBoonPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedBoonPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {allBoonColumns.length === 0 ? (
                        <div className="px-4 py-10 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>No boons match this filter</div>
                    ) : (
                        (() => {
                            const columnTables = visibleBoonColumns;
                            const resolvedSortColumnId = columnTables.find((item: any) => item.id === denseSort.columnId)?.id
                                || (activeBoonTab && columnTables.some((item: any) => item.id === activeBoonTab) ? activeBoonTab : undefined)
                                || columnTables[0]?.id
                                || '';
                            const tableRowMaps = new Map<string, Map<string, any>>();
                            const playerMap = new Map<string, any>();
                            columnTables.forEach((table: any) => {
                                const rowMap = new Map<string, any>();
                                table.rows.forEach((row: any) => {
                                    const key = row.account || row.name || row.id;
                                    if (!key) return;
                                    rowMap.set(key, row);
                                    if (!playerMap.has(key)) {
                                        playerMap.set(key, row);
                                    }
                                });
                                tableRowMaps.set(table.id, rowMap);
                            });
                            const rows = Array.from(playerMap.entries())
                                .filter(([key]) => selectedBoonPlayers.length === 0 || selectedBoonPlayers.includes(String(key)))
                                .map(([key, row]) => {
                                const values: Record<string, string> = {};
                                columnTables.forEach((table: any) => {
                                    const tableRow = tableRowMaps.get(table.id)?.get(key);
                                    values[table.id] = tableRow
                                        ? formatBoonMetricDisplay(tableRow, activeBoonCategory, table.stacking, activeBoonMetric, { roundCountStats })
                                        : '-';
                                });
                                return { key, row, values };
                            }).sort((a, b) => {
                                if (!resolvedSortColumnId) return String(a.key).localeCompare(String(b.key));
                                const table = columnTables.find((item: any) => item.id === resolvedSortColumnId);
                                const aRow = table ? tableRowMaps.get(table.id)?.get(a.key) : null;
                                const bRow = table ? tableRowMaps.get(table.id)?.get(b.key) : null;
                                const aVal = aRow ? getBoonMetricValue(aRow, activeBoonCategory, table?.stacking, activeBoonMetric) : 0;
                                const bVal = bRow ? getBoonMetricValue(bRow, activeBoonCategory, table?.stacking, activeBoonMetric) : 0;
                                const primary = denseSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                return primary || String(a.key).localeCompare(String(b.key));
                            });
                            return (
                                <DenseStatsTable
                                    title="Boon Output - Dense View"
                                    subtitle={`${activeBoonCategory.replace('Buffs', '')} • ${activeBoonMetric === 'total' ? 'Total Gen' : activeBoonMetric === 'average' ? 'Gen/Sec' : 'Uptime'}`}
                                    sortColumnId={resolvedSortColumnId}
                                    sortDirection={denseSort.dir}
                                    onSortColumn={(columnId) => {
                                        setDenseSort((prev) => ({
                                            columnId,
                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        }));
                                    }}
                                    columns={columnTables.map((boon: any) => ({
                                        id: boon.id,
                                        label: <InlineIconLabel name={boon.name} iconUrl={boon.icon} iconClassName="h-4 w-4" />,
                                        align: 'right',
                                        minWidth: 90
                                    }))}
                                    rows={rows.map((entry, idx) => ({
                                        id: `${entry.key}-${idx}`,
                                        label: (
                                            <>
                                                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                                                {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                                <span className="truncate">{entry.row.account || entry.row.name || entry.key}</span>
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
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <PillToggleGroup
                    value={activeBoonCategory}
                    onChange={setActiveBoonCategory}
                    options={[
                        { value: 'selfBuffs', label: 'Self' },
                        { value: 'groupBuffs', label: 'Group' },
                        { value: 'squadBuffs', label: 'Squad' },
                        { value: 'totalBuffs', label: 'Total' }
                    ]}
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-[color:var(--text-secondary)]"
                />
                <PillToggleGroup
                    value={activeBoonMetric}
                    onChange={setActiveBoonMetric}
                    options={[
                        { value: 'total', label: 'Total Gen' },
                        { value: 'average', label: 'Gen/Sec' },
                        { value: 'uptime', label: 'Uptime' }
                    ]}
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-[color:var(--text-secondary)]"
                />
            </div>
            <StatsTableLayout
                expanded={expandedSection === 'boon-output'}
                sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${expandedSection === 'boon-output' ? 'h-full flex-1' : ''}`}
                sidebarStyle={undefined}
                contentClassName={`overflow-hidden ${expandedSection === 'boon-output' ? 'flex flex-col min-h-0' : ''}`}
                contentStyle={undefined}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Boons</div>
                        <input
                            value={boonSearch}
                            onChange={(e) => setBoonSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs focus:outline-none mb-2"
                            style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'boon-output' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {filteredBoonTables.length === 0 ? (
                                <div className="text-center italic py-6 text-xs" style={{ color: 'var(--text-muted)' }}>No boons match this filter</div>
                            ) : (
                                filteredBoonTables.map((boon: any) => (
                                    <button
                                        key={boon.id}
                                        onClick={() => setActiveBoonTab(boon.id)}
                                        className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeBoonTab === boon.id
                                            ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                            : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                        style={activeBoonTab !== boon.id ? { color: 'var(--text-secondary)' } : undefined}
                                    >
                                        <InlineIconLabel name={boon.name} iconUrl={boon.icon} iconClassName="h-3.5 w-3.5" />
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                }
                content={
                    !activeBoonTable ? (
                        <div className="px-4 py-10 text-center italic text-sm" style={{ color: 'var(--text-muted)' }}>Select a boon to view details</div>
                    ) : (
                        <StatsTableShell
                            expanded={expandedSection === 'boon-output'}
                            maxHeightClass="max-h-64"
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
                                            {activeBoonMetric === 'total'
                                                ? 'Total'
                                                : activeBoonMetric === 'average'
                                                    ? 'Gen/Sec'
                                                    : 'Uptime'}
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
                                    {[...activeBoonTable.rows]
                                        .sort((a: any, b: any) => (
                                            (() => {
                                                const aVal = sortState.key === 'fightTime'
                                                    ? Number(a.activeTimeMs || 0)
                                                    : getBoonMetricValue(a, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric);
                                                const bVal = sortState.key === 'fightTime'
                                                    ? Number(b.activeTimeMs || 0)
                                                    : getBoonMetricValue(b, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric);
                                                const diff = sortState.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                                return diff || String(a.account || '').localeCompare(String(b.account || ''));
                                            })()
                                        ))
                                        .map((row: any, idx: number) => (
                                            <div key={`${activeBoonTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm border-t" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}>
                                                <div className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{row.account}</span>
                                                </div>
                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                    {formatBoonMetricDisplay(row, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric, { roundCountStats })}
                                                </div>
                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                    {row.activeTimeMs ? `${(row.activeTimeMs / 1000).toFixed(1)}s` : '-'}
                                                </div>
                                            </div>
                                        ))}
                                </>
                            }
                        />
                    )
                }
            />
            </>
        )}
    </div>
    );
};
