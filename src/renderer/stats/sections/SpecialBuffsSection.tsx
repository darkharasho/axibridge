import { useMemo, useState } from 'react';
import { Maximize2, X, Columns, Users, Star } from 'lucide-react';
import { useMetricSectionState } from '../hooks/useMetricSectionState';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { useStatsSharedContext } from '../StatsViewContext';

type SpecialBuffsSectionProps = {
    specialSearch: string;
    setSpecialSearch: (value: string) => void;
    activeSpecialTab: string | null;
    setActiveSpecialTab: (value: string | null) => void;
    activeSpecialTable: any | null;
};

type SpecialSortKey = 'total' | 'perSecond' | 'duration';
type SpecialViewMode = 'received' | 'output';
const truncateSidebarLabel = (name: string, max = 30) => {
    if (!name) return '';
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
};

export const SpecialBuffsSection = ({
    specialSearch,
    setSpecialSearch,
    activeSpecialTab,
    setActiveSpecialTab,
    activeSpecialTable
}: SpecialBuffsSectionProps) => {
    const { stats, formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const [sortKey, setSortKey] = useState<SpecialSortKey>('total');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [viewMode, setViewMode] = useState<SpecialViewMode>('received');
    const isExpanded = expandedSection === 'special-buffs';
    const allSpecialColumns = stats.specialTables || [];
    const getRowsForMode = (table: any): any[] => {
        if (!table) return [];
        if (viewMode === 'output') {
            if (Array.isArray(table.rowsOutput)) return table.rowsOutput;
            return [];
        }
        if (Array.isArray(table.rowsReceived)) return table.rowsReceived;
        return Array.isArray(table.rows) ? table.rows : [];
    };
    const specialMetrics = useMemo(
        () => [...allSpecialColumns]
            .filter((buff: any) => getRowsForMode(buff).length > 0)
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
            .map((buff: any) => ({ ...buff, label: buff.name })),
        [allSpecialColumns, viewMode]
    );
    const specialRows = useMemo(
        () => (stats.specialTables || []).flatMap((t: any) => getRowsForMode(t)).filter((r: any) => !!r.account),
        [stats.specialTables, viewMode]
    );
    const {
        denseSort, setDenseSort,
        selectedColumnIds: selectedSpecialColumns, setSelectedColumnIds: setSelectedSpecialColumns,
        selectedPlayers: selectedSpecialPlayers, setSelectedPlayers: setSelectedSpecialPlayers,
        filteredMetrics: filteredSpecialTables,
        selectedMetrics: visibleSpecialTables,
        playerOptions: specialPlayerOptions,
        searchSelectedIds: specialSearchSelectedIds,
    } = useMetricSectionState({
        metrics: specialMetrics,
        rows: specialRows,
        search: specialSearch,
        renderProfessionIcon,
    });
    const specialColumnOptions = filteredSpecialTables.map((buff: any) => ({
        id: buff.id,
        label: buff.name,
        icon: buff.icon ? <img src={buff.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
    }));

    const activeRowsForMode = useMemo(() => getRowsForMode(activeSpecialTable), [activeSpecialTable, viewMode]);
    const sortedRows = useMemo(() => {
        if (!activeRowsForMode.length) return [];
        const rows = [...activeRowsForMode];
        rows.sort((a: any, b: any) => {
            const aVal = Number(a?.[sortKey] ?? 0);
            const bVal = Number(b?.[sortKey] ?? 0);
            const diff = sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
            if (diff !== 0) return diff;
            return String(a?.account || '').localeCompare(String(b?.account || ''));
        });
        return rows;
    }, [activeRowsForMode, sortKey, sortDirection]);

    const updateSort = (nextKey: SpecialSortKey) => {
        if (sortKey === nextKey) {
            setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
            return;
        }
        setSortKey(nextKey);
        setSortDirection('desc');
    };

    const sortIndicator = (key: SpecialSortKey) => {
        if (sortKey !== key) return '';
        return sortDirection === 'desc' ? ' ↓' : ' ↑';
    };

    return (
        <div
            className={`stats-share-exclude ${expandedSection === 'special-buffs'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
                : ''
            }`}
            style={expandedSection === 'special-buffs' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
        <div className="flex items-center gap-2 mb-3.5">
            <Star className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                Special Buffs
            </h3>
            <div className="ml-auto flex items-center gap-2">
                <PillToggleGroup
                    value={viewMode}
                    onChange={(value) => setViewMode(value as SpecialViewMode)}
                    options={[
                        { value: 'received', label: 'Received' },
                        { value: 'output', label: 'Output' }
                    ]}
                    className="inline-flex w-auto"
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-[color:var(--text-secondary)]"
                />
                <button
                    type="button"
                    onClick={() => (expandedSection === 'special-buffs' ? closeExpandedSection() : openExpandedSection('special-buffs'))}
                    className="flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={expandedSection === 'special-buffs' ? 'Close Special Buffs' : 'Expand Special Buffs'}
                    title={expandedSection === 'special-buffs' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'special-buffs' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
        </div>
        {stats.specialTables.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No special buff data available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="border rounded-[var(--radius-md)] px-4 py-3" style={{ background: 'var(--bg-hover)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Special Buffs</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...allSpecialColumns.map((buff: any) => ({ id: buff.id, label: buff.name, type: 'column' as const })),
                                ...specialPlayerOptions.map((option) => ({
                                    id: option.id,
                                    label: option.label,
                                    type: 'player' as const,
                                    icon: option.icon,
                                })),
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedSpecialColumns((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedSpecialPlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={specialSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <ColumnFilterDropdown
                            options={specialColumnOptions}
                            selectedIds={selectedSpecialColumns}
                            onToggle={(id) => {
                                setSelectedSpecialColumns((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedSpecialColumns([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <ColumnFilterDropdown
                            options={specialPlayerOptions}
                            selectedIds={selectedSpecialPlayers}
                            onToggle={(id) => {
                                setSelectedSpecialPlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedSpecialPlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
                        <PillToggleGroup
                            value={sortKey}
                            onChange={(value) => setSortKey(value as SpecialSortKey)}
                            options={[
                                { value: 'total', label: 'Total' },
                                { value: 'perSecond', label: 'Per Sec' },
                                { value: 'duration', label: 'Fight Time' }
                            ]}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                    </div>
                    {(selectedSpecialColumns.length > 0 || selectedSpecialPlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedSpecialColumns([]);
                                    setSelectedSpecialPlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                            >
                                Clear All
                            </button>
                            {selectedSpecialColumns.map((id) => {
                                const label = allSpecialColumns.find((buff: any) => buff.id === id)?.name || id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedSpecialColumns((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                                    >
                                        <span>{label}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>×</span>
                                    </button>
                                );
                            })}
                            {selectedSpecialPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedSpecialPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {visibleSpecialTables.length === 0 ? (
                        <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No special buffs match this filter</div>
                    ) : (
                        (() => {
                            const columnTables = visibleSpecialTables;
                            const tableRowMaps = new Map<string, Map<string, any>>();
                            const playerMap = new Map<string, any>();
                            columnTables.forEach((table: any) => {
                                const rowMap = new Map<string, any>();
                                getRowsForMode(table).forEach((row: any) => {
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
                                .filter(([key]) => selectedSpecialPlayers.length === 0 || selectedSpecialPlayers.includes(String(key)))
                                .map(([key, row]) => {
                                const values: Record<string, string> = {};
                                const numericValues: Record<string, number> = {};
                                columnTables.forEach((table: any) => {
                                    const tableRow = tableRowMaps.get(table.id)?.get(key);
                                    if (!tableRow) {
                                        values[table.id] = '-';
                                        numericValues[table.id] = 0;
                                        return;
                                    }
                                    if (sortKey === 'duration') {
                                        values[table.id] = tableRow.duration ? `${tableRow.duration.toFixed(1)}s` : '-';
                                        numericValues[table.id] = Number(tableRow.duration || 0);
                                        return;
                                    }
                                    const raw = sortKey === 'total' ? tableRow.total : tableRow.perSecond;
                                    const decimals = sortKey === 'total' ? 0 : 1;
                                    numericValues[table.id] = Number(raw || 0);
                                    values[table.id] = formatWithCommas(raw || 0, decimals);
                                });
                                return { key, row, values, numericValues };
                            });
                            const resolvedSortColumnId = columnTables.find((item: any) => item.id === denseSort.columnId)?.id
                                || (activeSpecialTab && columnTables.some((item: any) => item.id === activeSpecialTab) ? activeSpecialTab : undefined)
                                || columnTables[0]?.id
                                || '';
                            const sortedRows2 = [...rows].sort((a, b) => {
                                if (!resolvedSortColumnId) return String(a.key).localeCompare(String(b.key));
                                const aVal = a.numericValues[resolvedSortColumnId] ?? 0;
                                const bVal = b.numericValues[resolvedSortColumnId] ?? 0;
                                const primary = denseSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                return primary || String(a.key).localeCompare(String(b.key));
                            });
                            return (
                                <DenseStatsTable
                                    title="Special Buffs - Dense View"
                                    subtitle={viewMode === 'output' ? 'Output Totals' : 'Received Totals'}
                                    sortColumnId={resolvedSortColumnId}
                                    sortDirection={denseSort.dir}
                                    onSortColumn={(columnId) => {
                                        setDenseSort((prev) => ({
                                            columnId,
                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        }));
                                    }}
                                    columns={columnTables.map((buff: any) => ({
                                        id: buff.id,
                                        label: <InlineIconLabel name={buff.name} iconUrl={buff.icon} iconClassName="h-4 w-4" />,
                                        align: 'right',
                                        minWidth: 90
                                    }))}
                                    rows={sortedRows2.map((entry, idx) => ({
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
            <StatsTableLayout
                expanded={expandedSection === 'special-buffs'}
                sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${expandedSection === 'special-buffs' ? 'h-full flex-1' : ''}`}
                sidebarStyle={undefined}
                contentClassName={`overflow-hidden ${expandedSection === 'special-buffs' ? 'flex flex-col min-h-0' : ''}`}
                contentStyle={undefined}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Special Buffs</div>
                        <input
                            value={specialSearch}
                            onChange={(e) => setSpecialSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs focus:outline-none mb-2"
                            style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'special-buffs' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {filteredSpecialTables.length === 0 ? (
                                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No special buffs match this filter</div>
                            ) : (
                                filteredSpecialTables.map((buff: any) => (
                                    <button
                                        key={buff.id}
                                        onClick={() => setActiveSpecialTab(buff.id)}
                                        title={buff.name}
                                        className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeSpecialTab === buff.id
                                            ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                            : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                        style={activeSpecialTab !== buff.id ? { color: 'var(--text-secondary)' } : undefined}
                                    >
                                        <InlineIconLabel
                                            name={truncateSidebarLabel(buff.name)}
                                            iconUrl={buff.icon}
                                            className="w-full"
                                            iconClassName="h-3.5 w-3.5"
                                            textClassName="max-w-[170px]"
                                        />
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                }
                content={
                    <>
                        {!activeSpecialTable ? (
                            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">Select a special buff to view details</div>
                        ) : activeRowsForMode.length === 0 ? (
                            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                                No {viewMode} data available for this buff
                            </div>
                        ) : (
                            <StatsTableShell
                                expanded={expandedSection === 'special-buffs'}
                                maxHeightClass="max-h-64"
                                header={null}
                                columns={
                                    <div className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-4 py-2 border-b border-[color:var(--border-default)]">
                                        <div className="text-center">#</div>
                                        <div>Player</div>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('total')}
                                            className="text-right transition-colors"
                                            style={{ color: sortKey === 'total' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                        >
                                            Total{sortIndicator('total')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('perSecond')}
                                            className="text-right transition-colors"
                                            style={{ color: sortKey === 'perSecond' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                        >
                                            Per Sec{sortIndicator('perSecond')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('duration')}
                                            className="text-right transition-colors"
                                            style={{ color: sortKey === 'duration' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                        >
                                            Fight Time{sortIndicator('duration')}
                                        </button>
                                    </div>
                                }
                                rows={
                                    <>
                                        {sortedRows.map((row: any, idx: number) => (
                                            <div key={`${activeSpecialTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] px-4 py-2 text-xs border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-primary)' }}>
                                                <div className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{row.account}</span>
                                                </div>
                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                    {Math.round(row.total).toLocaleString()}
                                                </div>
                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                    {formatWithCommas(row.perSecond, 1)}
                                                </div>
                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                    {row.duration ? `${row.duration.toFixed(1)}s` : '-'}
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                }
                            />
                        )}
                    </>
                }
            />
        )}
        </div>
    );
};
