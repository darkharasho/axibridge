import { useMemo, useState } from 'react';
import { Maximize2, Sparkles, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { InlineIconLabel } from '../ui/StatsViewShared';

type SpecialBuffsSectionProps = {
    stats: any;
    specialSearch: string;
    setSpecialSearch: (value: string) => void;
    filteredSpecialTables: any[];
    activeSpecialTab: string | null;
    setActiveSpecialTab: (value: string | null) => void;
    activeSpecialTable: any | null;
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

type SpecialSortKey = 'total' | 'perSecond' | 'duration';
const truncateSidebarLabel = (name: string, max = 30) => {
    if (!name) return '';
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
};

export const SpecialBuffsSection = ({
    stats,
    specialSearch,
    setSpecialSearch,
    filteredSpecialTables,
    activeSpecialTab,
    setActiveSpecialTab,
    activeSpecialTable,
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
}: SpecialBuffsSectionProps) => {
    const [sortKey, setSortKey] = useState<SpecialSortKey>('total');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: '', dir: 'desc' });
    const isExpanded = expandedSection === 'special-buffs';
    const [selectedSpecialColumns, setSelectedSpecialColumns] = useState<string[]>([]);
    const [selectedSpecialPlayers, setSelectedSpecialPlayers] = useState<string[]>([]);
    const allSpecialColumns = stats.specialTables || [];
    const selectedSpecialTables = selectedSpecialColumns.length > 0
        ? allSpecialColumns.filter((buff: any) => selectedSpecialColumns.includes(buff.id))
        : allSpecialColumns;
    const visibleSpecialTables = selectedSpecialTables;
    const specialColumnOptions = filteredSpecialTables.map((buff: any) => ({
        id: buff.id,
        label: buff.name,
        icon: buff.icon ? <img src={buff.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
    }));
    const specialPlayerOptions = Array.from(new Map((stats.specialTables || [])
        .flatMap((table: any) => table.rows || [])
        .filter((row: any) => row.account)
        .map((row: any) => [row.account, row])).values())
        .map((row: any) => ({
            id: row.account,
            label: row.account,
            icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
        }));
    const specialSearchSelectedIds = new Set([
        ...selectedSpecialColumns.map((id) => `column:${id}`),
        ...selectedSpecialPlayers.map((id) => `player:${id}`)
    ]);

    const sortedRows = useMemo(() => {
        if (!activeSpecialTable?.rows) return [];
        const rows = [...activeSpecialTable.rows];
        rows.sort((a: any, b: any) => {
            const aVal = Number(a?.[sortKey] ?? 0);
            const bVal = Number(b?.[sortKey] ?? 0);
            const diff = sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
            if (diff !== 0) return diff;
            return String(a?.account || '').localeCompare(String(b?.account || ''));
        });
        return rows;
    }, [activeSpecialTable, sortKey, sortDirection]);

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
            id="special-buffs"
            data-section-visible={isSectionVisible('special-buffs')}
            data-section-first={isFirstVisibleSection('special-buffs')}
            className={sectionClass('special-buffs', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${expandedSection === 'special-buffs'
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
                }`)}
        >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-300" />
                Special Buffs
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'special-buffs' ? closeExpandedSection() : openExpandedSection('special-buffs'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'special-buffs' ? 'Close Special Buffs' : 'Expand Special Buffs'}
                title={expandedSection === 'special-buffs' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'special-buffs' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {stats.specialTables.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No special buff data available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Special Buffs</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...allSpecialColumns.map((buff: any) => ({ id: buff.id, label: buff.name, type: 'column' as const })),
                                ...Array.from(new Map((stats.specialTables || [])
                                    .flatMap((table: any) => table.rows || [])
                                    .filter((row: any) => row.account)
                                    .map((row: any) => [row.account, row])).values())
                                    .map((row: any) => ({
                                        id: row.account,
                                        label: row.account,
                                        type: 'player' as const,
                                        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
                                    }))
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
                            activeClassName="bg-purple-500/20 text-purple-200 border border-purple-500/40"
                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
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
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
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
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                    >
                                        <span>{label}</span>
                                        <span className="text-gray-400">×</span>
                                    </button>
                                );
                            })}
                            {selectedSpecialPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedSpecialPlayers((prev) => prev.filter((entry) => entry !== id))}
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
                    {allSpecialColumns.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-500 italic text-sm">No special buffs match this filter</div>
                    ) : (
                        (() => {
                            const columnTables = visibleSpecialTables;
                            const tableRowMaps = new Map<string, Map<string, any>>();
                            const playerMap = new Map<string, any>();
                            columnTables.forEach((table) => {
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
                                .filter(([key]) => selectedSpecialPlayers.length === 0 || selectedSpecialPlayers.includes(String(key)))
                                .map(([key, row]) => {
                                const values: Record<string, string> = {};
                                const numericValues: Record<string, number> = {};
                                columnTables.forEach((table) => {
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
                            const resolvedSortColumnId = columnTables.find((item) => item.id === denseSort.columnId)?.id
                                || (activeSpecialTab && columnTables.some((item) => item.id === activeSpecialTab) ? activeSpecialTab : undefined)
                                || columnTables[0]?.id
                                || '';
                            const sortedRows = [...rows].sort((a, b) => {
                                if (!resolvedSortColumnId) return String(a.key).localeCompare(String(b.key));
                                const aVal = a.numericValues[resolvedSortColumnId] ?? 0;
                                const bVal = b.numericValues[resolvedSortColumnId] ?? 0;
                                const primary = denseSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                return primary || String(a.key).localeCompare(String(b.key));
                            });
                            return (
                                <DenseStatsTable
                                    title="Special Buffs - Dense View"
                                    subtitle="Totals"
                                    sortColumnId={resolvedSortColumnId}
                                    sortDirection={denseSort.dir}
                                    onSortColumn={(columnId) => {
                                        setDenseSort((prev) => ({
                                            columnId,
                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        }));
                                    }}
                                    columns={columnTables.map((buff) => ({
                                        id: buff.id,
                                        label: <InlineIconLabel name={buff.name} iconUrl={buff.icon} iconClassName="h-4 w-4" />,
                                        align: 'right',
                                        minWidth: 90
                                    }))}
                                    rows={sortedRows.map((entry, idx) => ({
                                        id: `${entry.key}-${idx}`,
                                        label: (
                                            <>
                                                <span className="text-gray-500 font-mono">{idx + 1}</span>
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
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'special-buffs' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'special-buffs' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Special Buffs</div>
                        <input
                            value={specialSearch}
                            onChange={(e) => setSpecialSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'special-buffs' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {filteredSpecialTables.length === 0 ? (
                                <div className="text-center text-gray-500 italic py-6 text-xs">No special buffs match this filter</div>
                            ) : (
                                filteredSpecialTables.map((buff: any) => (
                                    <button
                                        key={buff.id}
                                        onClick={() => setActiveSpecialTab(buff.id)}
                                        title={buff.name}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeSpecialTab === buff.id
                                            ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                                            : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
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
                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">Select a special buff to view details</div>
                        ) : (
                            <StatsTableShell
                                expanded={expandedSection === 'special-buffs'}
                                maxHeightClass="max-h-64"
                                header={
                                    <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                        <div className="text-sm font-semibold text-gray-200">
                                            <InlineIconLabel name={activeSpecialTable.name} iconUrl={activeSpecialTable.icon} iconClassName="h-4 w-4" />
                                        </div>
                                        <div className="text-xs uppercase tracking-widest text-gray-500">Totals</div>
                                    </div>
                                }
                                columns={
                                    <div className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                        <div className="text-center">#</div>
                                        <div>Player</div>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('total')}
                                            className={`text-right transition-colors ${sortKey === 'total' ? 'text-purple-200' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Total{sortIndicator('total')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('perSecond')}
                                            className={`text-right transition-colors ${sortKey === 'perSecond' ? 'text-purple-200' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Per Sec{sortIndicator('perSecond')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('duration')}
                                            className={`text-right transition-colors ${sortKey === 'duration' ? 'text-purple-200' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Fight Time{sortIndicator('duration')}
                                        </button>
                                    </div>
                                }
                                rows={
                                    <>
                                        {sortedRows.map((row: any, idx: number) => (
                                            <div key={`${activeSpecialTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{row.account}</span>
                                                </div>
                                                <div className="text-right font-mono text-gray-300">
                                                    {Math.round(row.total).toLocaleString()}
                                                </div>
                                                <div className="text-right font-mono text-gray-300">
                                                    {formatWithCommas(row.perSecond, 1)}
                                                </div>
                                                <div className="text-right font-mono text-gray-400">
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
